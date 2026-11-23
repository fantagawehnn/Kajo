param(
    [Parameter(Mandatory = $true)]
    [string]$SdkPath,

    [Parameter(Mandatory = $true)]
    [string]$DeveloperKeyPath
)

$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$compiler = Join-Path $SdkPath "bin\monkeyc.exe"
$jungleFile = Join-Path $projectRoot "monkey.jungle"
$outputDirectory = Join-Path $projectRoot "bin"

if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) {
    throw "Monkey C compiler not found: $compiler"
}

if (-not (Test-Path -LiteralPath $jungleFile -PathType Leaf)) {
    throw "Project file not found: $jungleFile"
}

if (-not (Test-Path -LiteralPath $DeveloperKeyPath -PathType Leaf)) {
    throw "Developer key not found. The key is required for signing and must not be committed."
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$devices = @("venu2plus", "venu3s")
Push-Location $projectRoot

try {
    foreach ($device in $devices) {
        $outputFile = Join-Path $outputDirectory ("KajoConnect-" + $device + ".prg")
        Write-Host "Building KAJO Connect for $device ..."

        & $compiler -f $jungleFile -d $device -o $outputFile -y $DeveloperKeyPath

        if ($LASTEXITCODE -ne 0) {
            throw "Monkey C build failed for $device (exit code $LASTEXITCODE)."
        }

        if (-not (Test-Path -LiteralPath $outputFile -PathType Leaf)) {
            throw "Compiler returned success but output file is missing: $outputFile"
        }

        Write-Host "Created: $outputFile"
    }
}
finally {
    Pop-Location
}

Write-Host "Both KAJO Connect device builds completed successfully."

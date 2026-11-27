# KAJO – Zonendefinitionen und sportwissenschaftliche Einordnung

## Grundprinzip

KAJO unterscheidet drei Arten von Einordnung:

1. **Individuelle Referenzbereiche:** HRV, Ruheherzfrequenz, Atemfrequenz und Schlafdauer werden gegen die eigene jüngere Historie bewertet.
2. **Modellbasierte Orientierungszonen:** Readiness, TSB und Garmin-Form sind Hilfen zur Einordnung, aber keine direkten physiologischen Messungen.
3. **Leistungs- und Trainingszonen:** Herzfrequenzzonen sollen möglichst aus individuellen Schwellenwerten abgeleitet werden. Wenn diese fehlen, darf nur ein klar gekennzeichnetes Näherungsmodell verwendet werden.

Eine Zone ist keine Diagnose und keine automatische Trainingsfreigabe. Krankheit und Verletzung haben unabhängig von Scores Vorrang. Fehlende oder nicht vergleichbare Daten bleiben unbekannt.

## Recovery und Health

### HRV

- Keine allgemeingültigen absoluten Millisekunden-Zonen.
- Referenz: Median der vorangegangenen 28 Tage, mindestens zwölf gültige Messungen derselben Metrik, Einheit und Datenquelle. Zwölf Werte entsprechen im Mittel drei Messungen pro Woche; das ist eine konservative KAJO-Mindestanforderung, kein universell validierter Grenzwert.
- Streuung: robuste Skala aus 1,4826 × MAD; falls erforderlich mindestens halbe Standardabweichung und ein metrikspezifischer Mindestwert.
- Einordnung der Abweichung in dieser Skala:
  - bis 1 Skalen-Einheit unter der Basis: üblicher Bereich
  - 1 bis 2: beobachten
  - über 2: deutliche Abweichung
- Ein ungewöhnlich hoher HRV-Wert wird nicht automatisch als bessere Erholung gewertet. Stabilität innerhalb des persönlichen Normalbereichs ist aussagekräftiger als ein möglichst hoher Einzelwert.
- Tageswerte sollen gemeinsam mit dem 7-Tage-Trend, Ruhepuls, Schlaf und subjektivem Befinden betrachtet werden.

### Ruheherzfrequenz

- Keine pauschalen bpm-Grenzen für alle Athleten.
- Referenz: persönlicher Median der vorherigen 28 Tage, mindestens zwölf gültige Messungen.
- Bis 1 robuste Streuung über der Basis: üblicher Bereich; 1–2: beobachten; über 2: deutliche Abweichung.
- Ein erhöhter Ruhepuls ist ein unspezifisches Signal und kann u. a. durch Trainingsbelastung, Schlaf, Hitze, Stress oder Krankheit beeinflusst werden. Er ist allein keine Diagnose.

### Atemfrequenz

- Individueller Median der vorherigen 28 Tage, mindestens zwölf gültige Messungen.
- Eine Erhöhung um mehr als eine robuste Streuung wird beobachtet; mehr als 2 Streuungen gilt als deutliche Abweichung.
- Die Atemfrequenz ist ein Kontextsignal und darf nicht isoliert zur Trainingsentscheidung führen.

### Schlafdauer

- Kein starres Optimum für alle Sportler. Die Schlafempfehlungen für Athleten sollen den individuellen Bedarf und Trainingsumfang berücksichtigen.
- KAJO verwendet deshalb den Median der vorherigen 28 Tage (mindestens zwölf Messungen) als persönliche Referenz. Diese Referenz beschreibt zunächst das beobachtete Schlafniveau und nicht zwingend den tatsächlichen Schlafbedarf:
  - höchstens 30 Minuten darunter: nahe am persönlichen Niveau
  - 30–60 Minuten darunter: beobachten
  - 60–90 Minuten darunter: deutliche Verkürzung
  - mehr als 90 Minuten darunter: starke Verkürzung
- Ohne persönliche Basis zeigt KAJO keine scheinpräzise grüne oder rote Zone. Unter sieben Stunden kann als allgemeiner Hinweis auf kurze Schlafdauer angezeigt werden, aber nicht als universelle Athleten-Grenze.

### Garmin Sleep Score

Nur für den proprietären Garmin-Score gelten die vom Hersteller ausgewiesenen Kategorien:
- 90–100: ausgezeichnet
- 80–89: gut
- 60–79: mittel
- unter 60: niedrig

Diese Grenzen sind Garmin-Kategorien, keine unabhängig validierten sportwissenschaftlichen Trainingsfreigaben.

### Subjektives Check-in (Skala 1–5)

- Schlafqualität und Motivation: 1–2 günstig, 3 mittel, 4–5 ungünstig.
- Müdigkeit, Muskelkater und Stress: 1–2 günstig, 3 mittel, 4–5 ungünstig.
- Die subjektiven Skalen bleiben getrennt von objektiven Wearable-Messungen sichtbar. Mehrere ungünstige Angaben sind relevanter als ein einzelner isolierter Wert.

### Readiness-Orientierungsindex (0–100)

- 80–100: günstige Tagesform
- 65–79: im Orientierungsbereich
- 45–64: vorsichtig beobachten
- 0–44: deutlich eingeschränkter Orientierungswert

Der Index ist ein interner, gewichteter KAJO-Orientierungswert und kein validierter Score. Er darf weder Krankheit noch Verletzung überstimmen und soll nicht allein über harte oder leichte Trainingseinheiten entscheiden.

## Training Load

### Herzfrequenzzonen

**Primäre Empfehlung:** Zonen aus einer individuellen Leistungsdiagnostik anhand ventilatorischer oder Laktatschwellen ableiten. Für Ausdauertraining sind die erste und zweite Schwelle (VT1/LT1 und VT2/LT2) physiologisch sinnvollere Anker als pauschale Prozentwerte der maximalen Herzfrequenz. Bei Kanu-Wildwasserrennsport sollten Tests möglichst paddelspezifisch erfolgen; Lauf- oder Radschwellen dürfen nicht ungeprüft übertragen werden.

**Fallback in KAJO:** Wenn keine individuellen Schwellen hinterlegt sind, kann die vorhandene Herzfrequenzreserve-Methode (Karvonen) mit fünf Zonen als Näherung genutzt werden. Die Grenzen 60/70/80/90 % der Herzfrequenzreserve (HRmax minus Ruhe-HF) sind operative Orientierungsgrenzen, keine exakt nachgewiesenen VT1-/VT2-Schwellen. Die erste Zone umfasst auch Werte unter 60 % HRR. Die App muss die Zonen als HF-Reserve-Modell kennzeichnen.

### CTL und ATL

- CTL (langfristig) und ATL (kurzfristig) sind exponentiell geglättete Trainingslastmodelle.
- Keine universellen absoluten Zonen: Ein Wert von 50 oder 100 ist nur innerhalb derselben Load-Methode, Einheit und Datenabdeckung sinnvoll interpretierbar.
- KAJO zeigt deshalb Verlauf, Veränderung und Datenabdeckung, aber keine allgemeingültige Ampelgrenze für CTL oder ATL.

### TSB (CTL minus ATL)

KAJO zeigt TSB als CTL minus ATL, aber verwendet bewusst keine allgemeingültigen Ampelgrenzen. CTL, ATL und TSB übernehmen die Einheit und Skala der ausgewählten Load-Methode. Ein identischer Zahlenwert kann deshalb bei HF-Zonenindex und sRPE eine andere Bedeutung haben. TSB-Verläufe dürfen nur innerhalb derselben Load-Methode, Einheit und ausreichenden Datenabdeckung verglichen werden.

Die zuvor erwogenen Orientierungsbereiche (unter −30, −30 bis −10, −10 bis +5, +5 bis +25 und über +25) sind keine universellen physiologischen Grenzwerte und werden in KAJO nicht als allgemeingültige Zonen verwendet.

### Relativer Saldo (Prozent)

KAJO kann aus CTL und ATL zusätzlich den relativen Saldo `(CTL − ATL) / CTL × 100` berechnen, sofern CTL größer als null ist. Das ist ein KAJO-abgeleiteter Modellwert und kein direkt übernommener Garmin-Herstellerwert. Er wird getrennt vom absoluten TSB dargestellt. Die Einordnung ist eine interne Orientierung und keine validierte Trainingsfreigabe:
- unter −25 %: hohe modellierte Ermüdung
- −25 bis unter −10 %: erhöhte modellierte Belastung
- −10 bis +5 %: ausgeglichen
- über +5 bis +20 %: frischer Modellstatus
- über +20 %: sehr frisch; Trainingskontext prüfen

### ACWR

ACWR ist nur ein ergänzender Verhältnisindikator und keine eigenständige Verletzungsprognose:
- unter 0,8: akute Last liegt unter dem chronischen Niveau
- 0,8–1,3: akute und chronische Last liegen relativ nahe beieinander (neutraler Vergleichsbereich, keine Sicherheitszone)
- 1,3 bis 1,5: erhöhter kurzfristiger Lastanstieg
- über 1,5: deutlicher kurzfristiger Lastanstieg

Die Werte 0,8 und 1,3 sind keine Sicherheitsgrenzen. KAJO darf daraus keine Verletzungswahrscheinlichkeit oder „sichere Zone“ ableiten. Interpretation immer zusammen mit Trainingsinhalt, subjektivem Befinden, Gesundheit und Datenqualität.

## Performance

### VO₂max

Keine allgemeingültigen App-Zonen auf Basis einzelner absoluter Werte. Garmin-Schätzung und Labor-Messung getrennt halten. Vorrang haben Trend, Messquelle, Messbedingungen und Vergleich innerhalb derselben Methode.

### Geschwindigkeit, Pace und Leistung

Trainingszonen möglichst aus sportartspezifischen Schwellen oder standardisierten Tests ableiten. Paddeln, Laufen und Radfahren nicht anhand derselben absoluten Werte vergleichen. Für Kanu sind K1/C1/C2 sowie Sprint/Classic getrennte Kontexte, wenn die Belastungscharakteristik nicht vergleichbar ist.

### Gewicht

Keine pauschalen Ziel- oder Risikozonen. Gewicht nur als Verlauf und im Kontext darstellen; keine automatische Leistungs- oder Gesundheitsbewertung aus einem Einzelwert.

## Wissenschaftliche Grundlage und Grenzen

- HRV: Gronwald et al. (2024), *Heart Rate Variability – Methods and Analysis in Sports Medicine and Exercise Science*, German Journal of Sports Medicine. Die Arbeit betont intraindividuelle Referenzwerte, standardisierte Messung und rollierende Mittelwerte.
- HRV im Training: *Heart Rate Variability Applications in Strength and Conditioning: A Narrative Review* (2024). Die Autoren empfehlen individuelle Baselines und warnen vor der Interpretation isolierter Tageswerte.
- Schlaf: Walsh et al. (2021), *Sleep and the athlete: narrative review and 2021 expert consensus recommendations*, British Journal of Sports Medicine, DOI: 10.1136/bjsports-2020-102025. Die Empfehlung betont den individuellen Schlafbedarf und den Einfluss von Trainingsbelastung und Kontext.
- Garmin Sleep Score: offizielle Garmin-Support-Kategorisierung (90–100 ausgezeichnet, 80–89 gut, 60–79 mittel, unter 60 niedrig).
- ACWR: aktuelle Meta-Analysen zeigen heterogene Zusammenhänge und betonen, dass ACWR nicht als alleiniger kausaler oder prädiktiver Verletzungsindikator eingesetzt werden sollte.

Die Grenzwerte in KAJO sind daher teils etablierte Herstellerkategorien, teils transparent ausgewiesene operative App-Regeln. Wo keine belastbaren universellen Grenzwerte existieren, verwendet KAJO individuelle Referenzen oder verzichtet bewusst auf eine Ampel.

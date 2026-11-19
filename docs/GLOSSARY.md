# KAJO – Glossar und Kennzahlenfarben

**Quellenhinweis:** Das Produktkonzept definiert Statusfarben und die Trennung von Sportartenfarben, aber keine exakten Kennzahlenfarben. Die untenstehenden Kennzahlenfarben sind daher die in dieser Preview vorgeschlagene einheitliche UI-Zuordnung und müssen gegen ein gegebenenfalls separates, verbindliches Glossar geprüft werden.

Dieses Glossar definiert die sichtbaren Begriffe und ihre Kennzahlenfarben. Die technischen Feldnamen und bestehenden Berechnungsmodelle bleiben unverändert.

| Sichtbarer Begriff | Bedeutung | Technischer Bezug | Farbe |
|---|---|---|---|
| Bereitschaft | tägliche Orientierung aus den tatsächlich verfügbaren physiologischen, Schlaf- und Befindensdaten; kein medizinischer Freigabewert | bestehender Readiness-Wert | Türkis #14B8A6 |
| Fitness | langfristige Belastungsentwicklung | CTL | Blau #6DA8F7 |
| Ermüdung | kurzfristige Belastungsentwicklung | ATL | Orange #F59E0B |
| Form | rechnerische Differenz aus Fitness und Ermüdung; kein eigenständiger Leistungstest | TSB bzw. vorhandener Belastungssaldo | Grün #39A96B |
| Belastung | Belastungswert einer einzelnen Trainingseinheit bzw. des ausgewählten Belastungsmodells | Load / sRPE / Garmin Load, getrennt nach Quelle | Hellorange #FDBA74 |
| Belastungsverhältnis | Verhältniskennzahl der kurzfristigen zur langfristigen Belastung; keine Verletzungsprognose | ACWR | Gelb #E5C45B |
| Befinden | tägliche subjektive Selbsteinschätzung | Check-in-Angaben | Violett #A78BFA |
| Gewicht | dokumentiertes Körpergewicht | Gewichtsmessung | Pink #EC7AAE |
| HRV | Herzfrequenzvariabilität; Messmethode und Quelle müssen erkennbar bleiben | HRV / RMSSD / SDNN, nicht gleichsetzen | Dunkeltürkis #0F766E |
| Ruhepuls | dokumentierte Ruheherzfrequenz | RHR | Rot-Rosa #FB7185 |
| Schlaf | Schlafdauer und Schlafqualität/-score als getrennte Größen | Schlafdaten | Hellblau #7DD3FC |

## Statusfarben gemäß Produktkonzept

- Grün kennzeichnet einen günstigen Status.
- Gelb/Orange kennzeichnet Aufmerksamkeit beziehungsweise einen mittleren Status.
- Rot kennzeichnet einen kritischen beziehungsweise ungünstigen Status.
- Blau kennzeichnet neutrale Informationen.
- Sportartenfarben sind davon unabhängig und kennzeichnen ausschließlich die jeweilige Sportart.

## Verbindliche Darstellungsregeln

- Die Farbe kennzeichnet die jeweilige Kennzahl, nicht die Bewertung ihrer Güte.
- Statusfarben (günstig, aufmerksam, kritisch) sind davon getrennt und dürfen die Kennzahlenfarben nicht ersetzen.
- Sportartenfarben bleiben unabhängig und kennzeichnen ausschließlich Sportarten.
- Technische Kürzel dürfen in Detailansichten ergänzend in Klammern erscheinen; die sichtbare Hauptbezeichnung folgt diesem Glossar.
- Unterschiedliche Belastungsmodelle werden nicht addiert oder als identische Kennzahlen dargestellt.
- Fehlende Werte bleiben fehlend und werden nicht als null interpretiert.
- Ein Readiness-/Bereitschaftswert ist eine Orientierung auf Basis der vorhandenen Daten, keine medizinische Aussage oder automatische Trainingsfreigabe.

## Analysezeiträume gemäß Produktkonzept, Abschnitt 6

Verbindliche Zeiträume sind 7, 28, 30, 42, 90 und 365 Tage sowie individuelle Saisonzeiträume. Die Ansichten dürfen zusätzliche technische Auswahlmöglichkeiten anbieten, müssen diese Zeiträume aber abdecken.

## Zusätzliche Diagramm-Darstellung – zur fachlichen Bestätigung

Das angehängte Produktkonzept legt in Abschnitt 6 die Analysezeiträume und Analysefragen fest, enthält aber keine konkreten Regeln zu Mindestabdeckung, Glättung, Wochenaggregation oder Mindestanzahl von Messwerten. Die folgenden Regeln wurden aus dem vorherigen Preview-Entwicklungsstand übernommen und sind daher zusätzliche UI-Entscheidungen, nicht wörtliche Vorgaben aus Abschnitt 6.

- Der Standardzeitraum passt sich an die verfügbare Datenabdeckung an. Als ausreichende Abdeckung für die Auswahl eines kürzeren Standardzeitraums gelten mindestens 70 % der Kalendertage. Das ist eine Darstellungsregel, kein physiologischer Grenzwert.
- Unterstützte Standardzeiträume sind 7, 28, 30 und 42 Tage sowie 90 und 365 Tage. Individuelle Zeiträume bleiben möglich, wo die Ansicht sie unterstützt.
- Fehlende Werte bleiben intern `null`; sie werden nicht als null gemessen, als Ruhetag oder als gesund interpretiert. Wenn eine Linie über eine Lücke hinweg verbunden wird, ist das Verbindungssegment heller und gestrichelt.
- Gewicht und einzelne subjektive Check-in-Skalen werden zusätzlich zum Originalwert mit einem gleitenden Sieben-Tage-Mittel dargestellt. Einzelmessungen bleiben sichtbar; das Mittel ersetzt sie nicht.
- Bei Gesundheitskennzahlen mit weniger als 70 % Abdeckung werden, sofern die Ansicht dies unterstützt, Wochenmittel aus den tatsächlich vorhandenen Messungen verwendet. Fehlende Wochen werden nicht ergänzt.
- Ein Verlaufsdiagramm benötigt grundsätzlich mindestens drei auswertbare Messwerte. Dokumentierte Einzelereignisse wie Krankheit oder Verletzung bleiben davon ausgenommen, da bereits ein einzelner Eintrag relevant ist.
- Zeitraum, Anzahl der Messwerte und Datenquelle werden in der Detailansicht kenntlich gemacht. Unterschiedliche Quellen, Einheiten und Belastungsmodelle werden nicht vermischt.

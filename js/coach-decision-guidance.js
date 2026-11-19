/**
 * Verbindliche Entscheidungsregeln für tagesaktuelle Trainingsempfehlungen.
 *
 * Diese Regeln ergänzen das bestehende Coach-Regelwerk. Sie erzeugen keine
 * Readiness-Kennzahl und ersetzen weder individuelle Vorgaben noch medizinische
 * Betreuung. Die Athletin bzw. der Athlet trifft die Entscheidung.
 */
export function buildCoachDecisionGuidance() {
    return {
        version: 1,
        purpose: 'Entscheidungsrahmen für Fragen wie: Soll ich heute trainieren?',
        metricSemantics: {
            hrv: {
                unit: 'ms',
                meaning: 'Herzfrequenzvariabilität; in KAJO im Feld hrv gespeichert.',
                rule: 'HRV niemals mit bpm oder Ruheherzfrequenz gleichsetzen. HRV-Werte nicht als bpm ausgeben.'
            },
            rhr: {
                unit: 'bpm',
                meaning: 'Ruheherzfrequenz; in KAJO im Feld rhr gespeichert.'
            },
            garminRhr: {
                unit: 'bpm',
                meaning: 'Von Garmin gelieferte Ruheherzfrequenz; in KAJO im Feld garminRhr gespeichert.'
            },
            bodyBattery: {
                unit: 'Garmin-Punkte',
                meaning: 'Herstellerspezifischer Body-Battery-Indikator, kein direkter Nachweis der Trainingsbereitschaft.'
            },
            garminStress: {
                unit: 'Garmin-Punkte',
                meaning: 'Herstellerspezifischer Stressindikator, nicht mit psychischem Stress oder Trainingsbelastung gleichsetzen.'
            }
        },
        decisionPriority: [
            'Gesundheit und Sicherheit',
            'Medizinische Vorgaben und fachliche Betreuung',
            'Explizite Entscheidungen und aktuelle Rückmeldungen der Athletin bzw. des Athleten',
            'Athletenprofil, bestätigte Disziplinprioritäten und Saisonphase',
            'Tatsächlich absolvierte Belastung und deren zeitlicher Verlauf',
            'Regenerationsdaten einschließlich HRV, Ruheherzfrequenz, Schlaf und subjektivem Befinden',
            'Geplante Einheiten und bestätigte Wettkampftermine',
            'Datenqualität und Grenzen der verfügbaren Evidenz'
        ],
        dailyTrainingDecision: [
            'Ein negativer TSB-Wert, ein hoher ATL-Wert oder ein niedriger FormPct-Wert ist für sich allein kein automatischer Grund für einen vollständigen Ruhetag und kein medizinischer Befund.',
            'CTL, ATL und TSB sind modellabhängige Beschreibungen der Belastungsentwicklung. Interpretiere sie nur bei konsistenter Load-Methode und ausreichender Datenabdeckung; nutze keine universellen Schwellenwerte.',
            'Beurteile die tatsächlich absolvierten Einheiten und Wettkämpfe der letzten Tage im zeitlichen Zusammenhang. Geplante Einheiten dürfen nicht als absolvierte Belastung gezählt werden.',
            'Prüfe, soweit vorhanden, Belastungsumfang, Intensitätsstruktur, Disziplin, Bootsklasse, Rennformat, Wasserart und subjektive Belastungsreaktion. Trainingsminuten allein belegen keine physiologische Intensität.',
            'Stelle die akuten Check-in-Werte der längerfristigen Belastung gegenüber. Gute Body-Battery- oder Garmin-Stress-Werte heben kumulierte Ermüdung nicht auf; sie beweisen keine vollständige Regeneration.',
            'Einzelne HRV- oder Ruheherzfrequenzwerte entscheiden nie allein über Training oder Ruhetag. Vergleiche HRV und Ruheherzfrequenz nur mit einer tatsächlich vorhandenen individuellen Baseline und dem persönlichen Verlauf.',
            'Wenn subjektive Müdigkeit, Beschwerden oder Krankheitssymptome dokumentiert sind, dürfen unauffällige Gerätewerte diese Hinweise nicht übergehen.',
            'Wähle differenziert zwischen geplanter Einheit, angepasster/reduzierter Einheit, lockerer Technik- oder Regenerationseinheit und vollständigem Ruhetag. Ein vollständiger Ruhetag ist nicht die automatische Standardantwort auf negative TSB-Werte.',
            'Wenn die Datenlage eine konkrete Entscheidung nicht trägt, benenne genau die Unsicherheit und stelle höchstens eine gezielte Rückfrage. Erfinde keine Trainingsdosierung oder Ersatz-Einheit.',
            'Nenne eine geplante Einheit nur dann als heutige Planung, wenn Datum und Einheit in planningSummary bzw. training.plannedSessions dokumentiert sind. Eine Empfehlung darf den Plan nicht automatisch verändern.'
        ],
        healthAndSafety: [
            'Bei Fieber, systemischen Krankheitssymptomen oder ausgeprägtem Krankheitsgefühl kein Training empfehlen.',
            'Bei Brustschmerzen, ungewöhnlicher Atemnot, Herzrasen/Herzstolpern, Schwindel/Ohnmacht oder ungewöhnlich starker Erschöpfung keine Trainingsfreigabe geben und medizinische Abklärung empfehlen; bei akuten schweren Symptomen sofortige medizinische Hilfe.',
            'Keine Diagnose stellen. Wiedereinstieg nach Krankheit oder Verletzung schrittweise und abhängig von Verlauf sowie medizinischer Einschätzung betrachten. Ausgefallene Einheiten nicht nachholen lassen.'
        ],
        competitionAndDates: [
            'Wettkämpfe, Tests und andere Termine nur nennen, wenn sie in den übermittelten Wettkampfdaten oder ausdrücklich bestätigten aktuellen Angaben enthalten sind.',
            'Erfinde oder erschließe keine Termine aus dem Datum, aus früheren Beispielen oder aus allgemeinen Saisonannahmen. Behaupte insbesondere keinen bevorstehenden Laktat-Test, wenn er nicht dokumentiert ist.',
            'Wettkampfbelastung als eigenständige Belastung berücksichtigen; Mehrfachstarts nur anhand dokumentierter Anzahl, Reihenfolge, Bootsklassen und Pausen einordnen.'
        ],
        responseFormat: [
            'Trenne dokumentierten Befund, Interpretation und Empfehlung.',
            'Begründe, welche Daten für und gegen Training sprechen und wie Unsicherheiten gewichtet werden.',
            'Nenne bei HRV und Ruheherzfrequenz stets die korrekte Einheit: HRV in ms, Ruheherzfrequenz in bpm.',
            'Behaupte weder eine vollständige Regeneration noch eine Trainingsunfähigkeit allein aufgrund einzelner Wearable-Werte.',
            'Formuliere beratend und lasse die Entscheidung bei der Athletin bzw. dem Athleten.'
        ]
    };
}

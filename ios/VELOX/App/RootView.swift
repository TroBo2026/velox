import SwiftUI
import CoreMotion

struct RootView: View {
    @StateObject private var barometer = BarometerService()

    var body: some View {
        TabView {
            DashboardView(barometer: barometer)
                .tabItem { Label("Übersicht", systemImage: "speedometer") }
            SensorStatusView(barometer: barometer)
                .tabItem { Label("Sensoren", systemImage: "waveform.path.ecg") }
            AboutView()
                .tabItem { Label("Mehr", systemImage: "ellipsis") }
        }
        .tint(Color(red: 0.34, green: 0.82, blue: 0.74))
    }
}

private struct DashboardView: View {
    @ObservedObject var barometer: BarometerService

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("VELOX").font(.system(size: 34, weight: .bold, design: .rounded))
                        Text("YOUR RIDE. YOUR WORLD.")
                            .font(.caption.weight(.semibold)).tracking(2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 24)

                    GroupBox {
                        VStack(alignment: .leading, spacing: 10) {
                            Label("Native iOS-Grundgerüst", systemImage: "iphone")
                                .font(.headline)
                            Text("Die eigenständige SwiftUI-App ist vorbereitet. GPS-Aufzeichnung, Archiv und Datenmigration werden schrittweise ergänzt.")
                                .font(.subheadline).foregroundStyle(.secondary)
                            Text("Noch kein produktiver Tourenbetrieb")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.orange)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    GroupBox("Barometer") {
                        HStack {
                            Image(systemName: barometer.isAvailable ? "barometer" : "exclamationmark.circle")
                                .font(.title2)
                            VStack(alignment: .leading) {
                                Text(barometer.isAvailable ? "Sensor laut iOS verfügbar" : "Nicht verfügbar")
                                    .font(.headline)
                                Text(barometer.latestSample.map {
                                    String(format: "%.2f kPa · relative %.1f m", $0.pressureKPa, $0.relativeAltitudeM)
                                } ?? "Noch keine Messung gestartet")
                                .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("VELOX")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct SensorStatusView: View {
    @ObservedObject var barometer: BarometerService

    var body: some View {
        NavigationStack {
            List {
                Section("Barometer · Core Motion") {
                    LabeledContent("Verfügbarkeit", value: barometer.isAvailable ? "Verfügbar" : "Nicht verfügbar")
                    LabeledContent("Aufzeichnung", value: barometer.isRecording ? "Aktiv" : "Inaktiv")
                    if let sample = barometer.latestSample {
                        LabeledContent("Druck", value: String(format: "%.3f kPa", sample.pressureKPa))
                        LabeledContent("Relative Höhenänderung", value: String(format: "%.2f m", sample.relativeAltitudeM))
                        LabeledContent("Zeitstempel", value: String(sample.timestampMs))
                    }
                    if let error = barometer.errorMessage {
                        Text(error).foregroundStyle(.red)
                    }
                    Button(barometer.isRecording ? "Messung stoppen" : "Barometer testen") {
                        if barometer.isRecording { barometer.stop() } else { barometer.start() }
                    }
                    .disabled(!barometer.isAvailable && !barometer.isRecording)
                }
                Section {
                    Text("Die relative Höhenänderung ist keine absolute Höhe über dem Meeresspiegel. Sie wird hier bewusst nicht als solche bezeichnet.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Sensorstatus")
        }
    }
}

private struct AboutView: View {
    var body: some View {
        NavigationStack {
            List {
                Section("Entwicklungsstand") {
                    LabeledContent("App", value: "Native SwiftUI-Vorbereitung")
                    LabeledContent("Daten", value: "Lokale Verarbeitung geplant")
                    LabeledContent("Build", value: "Noch nicht verifiziert")
                }
                Section("Wichtiger Hinweis") {
                    Text("Die bestehende VELOX-Web-/PWA-Version bleibt bis zu erfolgreichen Xcode-, Datenmigrations- und iPhone-Tests erhalten.")
                    Text("Diese frühe Oberfläche ist noch kein Ersatz für die Web-App und speichert noch keine Touren.")
                }
            }
            .navigationTitle("Mehr")
        }
    }
}

import SwiftUI
import CoreMotion

private enum VELOXStyle {
    static let background = Color(red: 0.035, green: 0.075, blue: 0.12)
    static let panel = Color(red: 0.075, green: 0.13, blue: 0.19)
    static let accent = Color(red: 0.34, green: 0.82, blue: 0.74)
    static let muted = Color.white.opacity(0.62)
}

struct RootView: View {
    @StateObject private var barometer = BarometerService()
    @StateObject private var recorder = RideRecorder()

    var body: some View {
        TabView {
            DashboardView(barometer: barometer, recorder: recorder)
                .tabItem { Label("Übersicht", systemImage: "speedometer") }
            SensorStatusView(barometer: barometer)
                .tabItem { Label("Sensoren", systemImage: "waveform.path.ecg") }
            AboutView()
                .tabItem { Label("Mehr", systemImage: "ellipsis") }
        }
        .tint(VELOXStyle.accent)
        .preferredColorScheme(.dark)
    }
}

private struct DashboardView: View {
    @ObservedObject var barometer: BarometerService
    @ObservedObject var recorder: RideRecorder
    @State private var savedRideCount = 0
    @State private var archiveMessage = "Archiv wird geprüft …"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("VELOX")
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .tracking(1.2)
                        Text("YOUR RIDE. YOUR WORLD.")
                            .font(.caption.weight(.semibold))
                            .tracking(2)
                            .foregroundStyle(VELOXStyle.muted)
                    }
                    .padding(.top, 12)

                    VStack(alignment: .leading, spacing: 10) {
                        Label("Native iOS · Entwicklungsstand", systemImage: "iphone")
                            .font(.headline)
                        Text("SwiftUI, lokales Archiv und eine erste GPS-Aufzeichnung sind vorbereitet. Der echte Gerätetest, Hintergrundbetrieb und Datenmigration sind noch offen.")
                            .font(.subheadline)
                            .foregroundStyle(VELOXStyle.muted)
                        HStack(spacing: 8) {
                            Circle().fill(.orange).frame(width: 7, height: 7)
                            Text("Noch nicht für echte Touren freigegeben")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.orange)
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(VELOXStyle.panel, in: RoundedRectangle(cornerRadius: 18))

                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Label("Tourenaufzeichnung", systemImage: "location.fill")
                                .font(.headline)
                            Spacer()
                            Text(recorder.state == .recording ? "AKTIV" : recorder.state == .paused ? "PAUSIERT" : "BEREIT")
                                .font(.system(size: 10, weight: .bold))
                                .tracking(0.8)
                                .foregroundStyle(recorder.state == .recording ? VELOXStyle.accent : .secondary)
                        }
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(String(format: "%.2f", recorder.distanceMeters / 1_000))
                                .font(.system(size: 32, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                            Text("km")
                                .font(.subheadline)
                                .foregroundStyle(VELOXStyle.muted)
                        }
                        Text(recorder.message)
                            .font(.caption)
                            .foregroundStyle(VELOXStyle.muted)
                        if let accuracy = recorder.lastAccuracyMeters {
                            Text(String(format: "Letzte GPS-Genauigkeit: ±%.0f m", accuracy))
                                .font(.caption2)
                                .foregroundStyle(VELOXStyle.muted)
                        }
                        if let error = recorder.persistenceError {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                        HStack(spacing: 10) {
                            if recorder.state == .recording {
                                Button("Pause", systemImage: "pause.fill") { recorder.pause() }
                                    .buttonStyle(.bordered)
                                Button("Beenden", systemImage: "stop.fill", role: .destructive) { recorder.stop() }
                                    .buttonStyle(.borderedProminent)
                            } else if recorder.state == .paused {
                                Button("Fortsetzen", systemImage: "play.fill") { recorder.resume() }
                                    .buttonStyle(.borderedProminent)
                                Button("Beenden", systemImage: "stop.fill", role: .destructive) { recorder.stop() }
                                    .buttonStyle(.bordered)
                            } else {
                                Button("Tour starten", systemImage: "record.circle.fill") { recorder.start() }
                                    .buttonStyle(.borderedProminent)
                                    .disabled(recorder.state == .requestingPermission)
                            }
                        }
                        .tint(VELOXStyle.accent)
                        Text("GPS-Aufzeichnung startet nur nach deinem Tastendruck. In dieser Entwicklungsstufe läuft sie nur im Vordergrund; App-Wechsel oder Display-Sperre können die Aufzeichnung unterbrechen.")
                            .font(.caption2)
                            .foregroundStyle(VELOXStyle.muted)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(VELOXStyle.panel, in: RoundedRectangle(cornerRadius: 18))

                    VStack(alignment: .leading, spacing: 12) {
                        Label("Lokales Tourenarchiv", systemImage: "externaldrive")
                            .font(.headline)
                        HStack(alignment: .firstTextBaseline) {
                            Text(String(savedRideCount))
                                .font(.system(size: 30, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                            Text(savedRideCount == 1 ? "gespeicherte Tour" : "gespeicherte Touren")
                                .font(.subheadline)
                                .foregroundStyle(VELOXStyle.muted)
                        }
                        Text(archiveMessage)
                            .font(.caption)
                            .foregroundStyle(VELOXStyle.muted)
                        Text("Lokale Speicherung ist vorbereitet. Tourenaufzeichnung und automatische Speicherung sind noch nicht freigegeben.")
                            .font(.caption2)
                            .foregroundStyle(VELOXStyle.muted)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(VELOXStyle.panel, in: RoundedRectangle(cornerRadius: 18))

                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Label("Barometer", systemImage: "barometer")
                                .font(.headline)
                            Spacer()
                            Text(barometer.isAvailable ? "BEREIT" : "NICHT VERFÜGBAR")
                                .font(.system(size: 10, weight: .bold))
                                .tracking(0.8)
                                .foregroundStyle(barometer.isAvailable ? VELOXStyle.accent : .secondary)
                        }
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(barometer.latestSample.map { String(format: "%.2f", $0.relativeAltitudeM) } ?? "–")
                                .font(.system(size: 34, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                            Text("m relativ")
                                .font(.subheadline)
                                .foregroundStyle(VELOXStyle.muted)
                        }
                        Text(barometer.latestSample.map {
                            String(format: "%.2f kPa · %@", $0.pressureKPa, Date(timeIntervalSince1970: Double($0.timestampMs) / 1_000).formatted(date: .omitted, time: .standard))
                        } ?? "Noch keine Messung gestartet")
                            .font(.caption)
                            .foregroundStyle(VELOXStyle.muted)
                        Text("Relative Höhenänderung seit Start der Sensormessung – keine absolute Meereshöhe.")
                            .font(.caption2)
                            .foregroundStyle(VELOXStyle.muted)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(VELOXStyle.panel, in: RoundedRectangle(cornerRadius: 18))

                    VStack(alignment: .leading, spacing: 8) {
                        Label("Nächste native Ausbaustufen", systemImage: "list.bullet")
                            .font(.headline)
                        ReadinessRow(title: "Core Location GPS-Recorder", detail: "Vordergrund-Grundfunktion implementiert · Gerätetest offen")
                        ReadinessRow(title: "Lokales Tourenarchiv", detail: "Implementiert · Xcode- und Persistenztests offen")
                        ReadinessRow(title: "Web-Backup-Migration", detail: "Codec-Grundlage vorhanden · Tests offen")
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(VELOXStyle.panel, in: RoundedRectangle(cornerRadius: 18))
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(VELOXStyle.background.ignoresSafeArea())
            .navigationTitle("VELOX")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                do {
                    let rides = try await RideStore().loadAll()
                    savedRideCount = rides.count
                    archiveMessage = "Archiv lesbar · lokal auf diesem Gerät"
                } catch {
                    archiveMessage = error.localizedDescription
                }
            }
        }
    }
}

private struct ReadinessRow: View {
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.subheadline.weight(.medium))
            Text(detail).font(.caption).foregroundStyle(VELOXStyle.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 5)
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
                    Text("Die relative Höhenänderung ist keine absolute Höhe über dem Meeresspiegel. Die Messung ist unabhängig von einer GPS-Tour und wird derzeit noch nicht in Touren gespeichert.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .scrollContentBackground(.hidden)
            .background(VELOXStyle.background)
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
                    LabeledContent("Deployment Target", value: "iOS 17.0")
                    LabeledContent("Build", value: "Xcode-Prüfung ausstehend")
                }
                Section("Daten und Sicherheit") {
                    Text("Die native Oberfläche speichert noch keine Touren. Es werden keine bestehenden Web-/PWA-Daten verändert.")
                    Text("Die bestehende VELOX-Web-/PWA-Version bleibt erhalten, bis Xcode-Build, Datenmigration und iPhone-Tests erfolgreich abgeschlossen sind.")
                }
                Section("Kosten") {
                    Text("Entwicklung weiterhin ohne kostenpflichtige APIs, Build-Dienste oder Entwickler-Abonnements.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(VELOXStyle.background)
            .navigationTitle("Mehr")
        }
    }
}

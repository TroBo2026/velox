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

    var body: some View {
        TabView {
            DashboardView(barometer: barometer)
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
                        Text("Das SwiftUI-Grundgerüst und der echte Barometerzugriff sind vorbereitet. GPS-Tourenaufzeichnung, Archiv und Datenmigration werden separat entwickelt.")
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
                        ReadinessRow(title: "Core Location GPS-Recorder", detail: "Noch nicht implementiert")
                        ReadinessRow(title: "Lokales Tourenarchiv", detail: "Noch nicht implementiert")
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

import SwiftUI
import CoreMotion

private enum VELOXStyle {
    static let background = Color(red: 0.035, green: 0.075, blue: 0.12)
    static let panel = Color(red: 0.075, green: 0.13, blue: 0.19)
    static let accent = Color(red: 0.34, green: 0.82, blue: 0.74)
    static let muted = Color.white.opacity(0.62)
}

struct RootView: View {
    @StateObject private var recorder = RideRecorder()
    @StateObject private var watch = WatchConnectivityService()

    var body: some View {
        TabView {
            DashboardView(barometer: recorder.barometer, recorder: recorder, watch: watch)
                .tabItem { Label("Übersicht", systemImage: "speedometer") }
            SensorStatusView(barometer: recorder.barometer)
                .tabItem { Label("Sensoren", systemImage: "waveform.path.ecg") }
            AboutView()
                .tabItem { Label("Mehr", systemImage: "ellipsis") }
        }
        .tint(VELOXStyle.accent)
        .preferredColorScheme(.dark)
        .onReceive(watch.$latestSample.compactMap { $0 }) { sample in
            recorder.acceptWatchSample(sample)
        }
    }
}

private struct DashboardView: View {
    @ObservedObject var barometer: BarometerService
    @ObservedObject var recorder: RideRecorder
    @ObservedObject var watch: WatchConnectivityService
    @State private var savedRideCount = 0
    @State private var archiveMessage = "Archiv wird geprüft …"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    DashboardHeader()
                    NativeStatusCard()
                    RideControlCard(recorder: recorder)
                    WatchStatusCard(watch: watch)
                    ArchiveStatusCard(count: savedRideCount, message: archiveMessage)
                    ElevationStatusCard(barometer: barometer, recorder: recorder)
                    ReadinessCard()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(VELOXStyle.background.ignoresSafeArea())
            .navigationTitle("VELOX")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await refreshArchive()
                watch.refreshStatus()
                publishRideSnapshot()
            }
            .onChange(of: recorder.distanceMeters) { _, _ in publishRideSnapshot() }
            .onChange(of: recorder.state) { _, _ in publishRideSnapshot() }
            .onChange(of: recorder.currentRide?.id) { _, _ in publishRideSnapshot() }
        }
    }

    @MainActor
    private func refreshArchive() async {
        do {
            let rides = try await RideStore().loadAll()
            savedRideCount = rides.count
            archiveMessage = "Archiv lesbar · lokal auf diesem Gerät"
        } catch {
            archiveMessage = error.localizedDescription
        }
    }

    private func publishRideSnapshot() {
        watch.updateRideSnapshot(
            rideID: recorder.currentRide?.id,
            distanceMeters: recorder.distanceMeters,
            rideState: recorder.state.rawValue
        )
    }
}

private struct DashboardHeader: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("VELOX")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .tracking(1.2)
            Text("YOUR RIDE. YOUR WORLD.")
                .font(.caption.weight(.semibold))
                .tracking(2)
                .foregroundStyle(VELOXStyle.muted)
        }
        .padding(.top, 8)
    }
}

private struct NativeStatusCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Native iOS · Entwicklungsstand", systemImage: "iphone")
                .font(.headline)
            Text("Die native Xcode-Version wird automatisiert gebaut und geprüft. Ein erfolgreicher Simulator-Build ersetzt noch keinen iPhone-Gerätetest.")
                .font(.subheadline)
                .foregroundStyle(VELOXStyle.muted)
            Label("Noch nicht für echte Touren freigegeben", systemImage: "exclamationmark.triangle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
        }
        .veloxCard()
    }
}

private struct RideControlCard: View {
    @ObservedObject var recorder: RideRecorder

    private var stateLabel: String {
        switch recorder.state {
        case .recording: return "AKTIV"
        case .paused: return "PAUSIERT"
        case .requestingPermission: return "BERECHTIGUNG"
        case .failed: return "FEHLER"
        case .idle: return "BEREIT"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Tourenaufzeichnung", systemImage: "location.fill").font(.headline)
                Spacer()
                Text(stateLabel)
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(recorder.state == .recording ? VELOXStyle.accent : .secondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(String(format: "%.2f", recorder.distanceMeters / 1_000))
                    .font(.system(size: 32, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                Text("km").font(.subheadline).foregroundStyle(VELOXStyle.muted)
            }
            Text(recorder.message).font(.caption).foregroundStyle(VELOXStyle.muted)
            if let accuracy = recorder.lastAccuracyMeters {
                Text(String(format: "Letzte GPS-Genauigkeit: ±%.0f m", accuracy))
                    .font(.caption2).foregroundStyle(VELOXStyle.muted)
            }
            if let error = recorder.persistenceError {
                Text(error).font(.caption).foregroundStyle(.red)
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
                        .disabled(recorder.state == .requestingPermission || recorder.state == .failed)
                }
            }
            .tint(VELOXStyle.accent)
            Text("GPS und Barometer starten erst nach deinem Tastendruck. Die aktuelle iPhone-Aufzeichnung ist vordergrundorientiert; App-Wechsel oder Display-Sperre können sie unterbrechen.")
                .font(.caption2).foregroundStyle(VELOXStyle.muted)
        }
        .veloxCard()
    }
}

private struct WatchStatusCard: View {
    @ObservedObject var watch: WatchConnectivityService

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Apple Watch", systemImage: "applewatch").font(.headline)
                Spacer()
                Circle().fill(watch.isReachable ? VELOXStyle.accent : .orange).frame(width: 8, height: 8)
            }
            Text(watch.statusMessage).font(.subheadline).foregroundStyle(VELOXStyle.muted)
            if let bpm = watch.latestHeartRateBPM {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(String(format: "%.0f", bpm))
                        .font(.system(size: 30, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    Text("BPM · Herzfrequenz von Watch")
                        .font(.caption).foregroundStyle(VELOXStyle.muted)
                }
                if let measuredAt = watch.lastHeartRateDate {
                    Text("Empfangen: " + measuredAt.formatted(date: .omitted, time: .standard))
                        .font(.caption2).foregroundStyle(VELOXStyle.muted)
                }
            } else {
                Text("Noch keine Herzfrequenz von einer VELOX Watch-App empfangen.")
                    .font(.caption).foregroundStyle(VELOXStyle.muted)
            }
            Text("Die iPhone-Verbindungs- und Speicherbasis ist vorbereitet. Eine eigenständige watchOS-App und echte Kopplungstests fehlen noch.")
                .font(.caption2).foregroundStyle(VELOXStyle.muted)
        }
        .veloxCard()
    }
}

private struct ArchiveStatusCard: View {
    let count: Int
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Lokales Tourenarchiv", systemImage: "externaldrive").font(.headline)
            HStack(alignment: .firstTextBaseline) {
                Text(String(count))
                    .font(.system(size: 30, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                Text(count == 1 ? "gespeicherte Tour" : "gespeicherte Touren")
                    .font(.subheadline).foregroundStyle(VELOXStyle.muted)
            }
            Text(message).font(.caption).foregroundStyle(VELOXStyle.muted)
            Text("Touren und Sensorproben werden lokal gespeichert. Persistenz und Datenmigration müssen zusätzlich auf einem echten iPhone geprüft werden.")
                .font(.caption2).foregroundStyle(VELOXStyle.muted)
        }
        .veloxCard()
    }
}

private struct ElevationStatusCard: View {
    @ObservedObject var barometer: BarometerService
    @ObservedObject var recorder: RideRecorder

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Barometer & Höhenanalyse", systemImage: "barometer").font(.headline)
                Spacer()
                Text(!barometer.isAvailable ? "NICHT VERFÜGBAR" : barometer.isRecording ? "AKTIV" : "BEREIT")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(barometer.isAvailable ? VELOXStyle.accent : .secondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(barometer.latestSample.map { String(format: "%.2f", $0.relativeAltitudeM) } ?? "–")
                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                Text("m relativ").font(.subheadline).foregroundStyle(VELOXStyle.muted)
            }
            Text(barometer.latestSample.map {
                String(format: "%.2f kPa · %@", $0.pressureKPa, Date(timeIntervalSince1970: Double($0.timestampMs) / 1_000).formatted(date: .omitted, time: .standard))
            } ?? "Noch keine Messung gestartet")
                .font(.caption).foregroundStyle(VELOXStyle.muted)
            Text("Relative Höhenänderung seit Start der Sensormessung – keine absolute Meereshöhe.")
                .font(.caption2).foregroundStyle(VELOXStyle.muted)
            MetricRow(title: "Aufstieg", value: String(format: "%.0f m", recorder.elevationAnalysis.ascentM), symbol: "arrow.up.right")
            MetricRow(title: "Abstieg", value: String(format: "%.0f m", recorder.elevationAnalysis.descentM), symbol: "arrow.down.right")
            Text("Referenz: \(recorder.elevationAnalysis.reference.rawValue)")
                .font(.caption.weight(.semibold))
            Text("\(recorder.elevationAnalysis.gpsAnchorCount) GPS-Referenzpaare · \(recorder.elevationAnalysis.rawBarometerCount) Roh-Barometerproben · \(recorder.elevationAnalysis.usableGPSAltitudeCount) geeignete GPS-Höhen")
                .font(.caption2).foregroundStyle(VELOXStyle.muted)
            if let offset = recorder.elevationAnalysis.calibrationOffsetM {
                Text(String(format: "Median der kalibrierten Sitzungs-Offsets: %+.1f m", offset))
                    .font(.caption2).foregroundStyle(VELOXStyle.muted)
            }
            if let spread = recorder.elevationAnalysis.calibrationSpreadM {
                Text(String(format: "Größte Sitzungs-MAD der Referenzpaare: %.1f m", spread))
                    .font(.caption2).foregroundStyle(VELOXStyle.muted)
            }
            ElevationProfileChart(points: recorder.elevationAnalysis.profile)
            Text("Barometer = Verlauf · GPS = Höhenbezug. Je Sensorsitzung sind mindestens drei zeitnahe echte GPS-Höhenreferenzen nötig. Rohdaten bleiben unverändert.")
                .font(.caption2).foregroundStyle(VELOXStyle.muted)
        }
        .veloxCard()
    }
}

private struct MetricRow: View {
    let title: String
    let value: String
    let symbol: String

    var body: some View {
        HStack {
            Label(title, systemImage: symbol).foregroundStyle(VELOXStyle.accent)
            Spacer()
            Text(value).monospacedDigit()
        }
    }
}

private struct ReadinessCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Nächste native Ausbaustufen", systemImage: "list.bullet").font(.headline)
            ReadinessRow(title: "Core Location GPS-Recorder", detail: "Vordergrund-Grundfunktion implementiert · Gerätetest offen")
            ReadinessRow(title: "Core Motion", detail: "Echte Barometerproben mit Zeitstempel · Auswertung vorläufig")
            ReadinessRow(title: "Höhenanalyse", detail: "GPS-Referenzoffset per Median · Rohdaten bleiben erhalten · Gerätetest offen")
            ReadinessRow(title: "Lokales Tourenarchiv", detail: "Persistenz implementiert · Geräte- und Migrationstests offen")
            ReadinessRow(title: "Apple Watch", detail: "iPhone-Transport und Datenmodell vorbereitet · Watch-App fehlt")
        }
        .veloxCard()
    }
}

private extension View {
    func veloxCard() -> some View {
        self
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(VELOXStyle.panel, in: RoundedRectangle(cornerRadius: 18))
    }
}

private struct ElevationProfileChart: View {
    let points: [RideElevationProfilePoint]

    var body: some View {
        GeometryReader { geometry in
            if points.count >= 2,
               let minimum = points.map(\.altitudeM).min(),
               let maximum = points.map(\.altitudeM).max() {
                let range = max(1, maximum - minimum)
                Path { path in
                    for (index, point) in points.enumerated() {
                        let totalDistance = max(1, points.last?.distanceM ?? 1)
                        let x = CGFloat(point.distanceM / totalDistance) * geometry.size.width
                        let y = geometry.size.height - CGFloat((point.altitudeM - minimum) / range) * geometry.size.height
                        if index == 0 || points[index - 1].segmentID != point.segmentID {
                            path.move(to: CGPoint(x: x, y: y))
                        } else {
                            path.addLine(to: CGPoint(x: x, y: y))
                        }
                    }
                }
                .stroke(VELOXStyle.accent, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            } else {
                Text("Höhenprofil erscheint mit ausreichend GPS- und Barometerdaten.")
                    .font(.caption2)
                    .foregroundStyle(VELOXStyle.muted)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            }
        }
        .frame(height: 112)
        .padding(.vertical, 4)
        .accessibilityLabel("Abgeleitetes Höhenprofil")
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
                    Text("Relative Höhe ist keine absolute Meereshöhe. Die Aufstiegs-/Abstiegswerte sind eine konservative erste Auswertung und noch nicht gerätevalidiert.")
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
                    LabeledContent("App", value: "Native SwiftUI-App")
                    LabeledContent("Deployment Target", value: "iOS 17.0")
                    LabeledContent("Gerätetest", value: "Noch offen")
                }
                Section("Daten und Sicherheit") {
                    Text("Die native Grundversion speichert neue GPS-Touren und Barometerproben lokal. Bestehende Web-/PWA-Daten werden nicht verändert; eine geprüfte Migration ist noch offen.")
                    Text("Die bestehende VELOX-Web-/PWA-Version bleibt erhalten, bis Xcode-Build, Datenmigration und iPhone-Tests erfolgreich abgeschlossen sind.")
                }
                Section("Kosten") {
                    Text("Entwicklung weiterhin ohne kostenpflichtige APIs, Build-Dienste oder Entwickler-Abonnements.")
                }
                Section("Impressum") {
                    Text("Anbieter- und Kontaktdaten werden vor einer öffentlichen Veröffentlichung rechtlich geprüft und anschließend ergänzt. Private Kontaktdaten sind in diesem Entwicklungsstand nicht hinterlegt.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(VELOXStyle.background)
            .navigationTitle("Mehr")
        }
    }
}

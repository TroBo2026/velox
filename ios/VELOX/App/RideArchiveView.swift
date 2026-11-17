import SwiftUI
import UniformTypeIdentifiers
import CoreLocation

struct RideArchiveView: View {
    @State private var rides: [Ride] = []
    @State private var message = "Archiv wird geladen …"
    @State private var errorMessage: String?
    @State private var isImporterPresented = false
    @State private var shareURL: URL?

    private let store = RideStore()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 10) {
                        Button {
                            exportBackup()
                        } label: {
                            Label("Sichern", systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(.borderedProminent)

                        Button {
                            isImporterPresented = true
                        } label: {
                            Label("Importieren", systemImage: "square.and.arrow.down")
                        }
                        .buttonStyle(.bordered)
                    }
                    if let shareURL {
                        ShareLink(item: shareURL) {
                            Label("VELOX-Sicherung teilen", systemImage: "doc.zipper")
                        }
                    }
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("Datensicherung · JSON-v1")
                }

                Section {
                    if rides.isEmpty {
                        ContentUnavailableView(
                            "Noch keine Touren",
                            systemImage: "bicycle",
                            description: Text("Starte eine Tour in der Übersicht. Gespeicherte Touren erscheinen anschließend hier.")
                        )
                    } else {
                        ForEach(rides) { ride in
                            NavigationLink {
                                RideDetailView(ride: ride)
                            } label: {
                                RideArchiveRow(ride: ride)
                            }
                            .swipeActions {
                                Button(role: .destructive) {
                                    delete(ride)
                                } label: {
                                    Label("Löschen", systemImage: "trash")
                                }
                            }
                        }
                    }
                } header: {
                    Text("Touren · \(rides.count)")
                }
            }
            .navigationTitle("Touren")
            .task { await refresh() }
            .refreshable { await refresh() }
            .fileImporter(
                isPresented: $isImporterPresented,
                allowedContentTypes: [.json],
                allowsMultipleSelection: false
            ) { result in
                handleImportSelection(result)
            }
            .alert("VELOX", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    @MainActor
    private func refresh() async {
        do {
            rides = try await store.loadAll()
            message = "Lokal gespeichert · \(rides.count) Touren"
        } catch {
            message = "Archiv konnte nicht gelesen werden."
            errorMessage = error.localizedDescription
        }
    }

    private func exportBackup() {
        Task {
            do {
                let data = try await store.exportBackup()
                let filename = "VELOX-Backup-\(Int(Date().timeIntervalSince1970)).json"
                let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
                try data.write(to: url, options: .atomic)
                shareURL = url
                message = "Sicherung erstellt · \(rides.count) Touren"
            } catch {
                errorMessage = "Export fehlgeschlagen: \(error.localizedDescription)"
            }
        }
    }

    private func handleImportSelection(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let error):
            errorMessage = error.localizedDescription
        case .success(let urls):
            guard let url = urls.first else { return }
            Task {
                let hasAccess = url.startAccessingSecurityScopedResource()
                defer {
                    if hasAccess { url.stopAccessingSecurityScopedResource() }
                }
                do {
                    let data = try Data(contentsOf: url)
                    let result = try await store.importBackup(from: data)
                    await refresh()
                    message = "\(result.rides.count) Touren importiert · \(result.remappedIDCount) ID-Kollisionen sicher umbenannt"
                } catch {
                    errorMessage = "Import abgebrochen. Das bisherige Archiv blieb unverändert. \(error.localizedDescription)"
                }
            }
        }
    }

    private func delete(_ ride: Ride) {
        Task {
            do {
                try await store.delete(id: ride.id)
                await refresh()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

private struct RideArchiveRow: View {
    let ride: Ride

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(ride.name?.isEmpty == false ? ride.name! : "Fahrradtour")
                .font(.headline)
            HStack(spacing: 8) {
                Text(Date(timeIntervalSince1970: ride.startedAt).formatted(date: .abbreviated, time: .shortened))
                Text("·")
                Text(ride.status.capitalized)
                Text("·")
                Text("\(ride.points.count) GPS-Punkte")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            HStack(spacing: 10) {
                Label("\((ride.watchSamples ?? []).count) Watch", systemImage: "applewatch")
                Label("\((ride.barometerSamples ?? []).count) Höhe", systemImage: "mountain.2")
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

private struct WatchCountRow: Identifiable {
    let kind: WatchSensorSample.Kind
    let count: Int
    var id: String { kind.rawValue }
}

private struct RideDetailView: View {
    let ride: Ride

    private var analysis: RideElevationAnalysis { RideElevationAnalysis(ride: ride) }

    private var durationSeconds: Double {
        let end = ride.endedAt ?? ride.startedAt
        return max(0, end - ride.startedAt - (ride.pausedMs ?? 0) / 1_000)
    }

    private var distanceMeters: Double {
        let valid = ride.points.filter {
            $0.lat.isFinite && $0.lon.isFinite &&
            (-90...90).contains($0.lat) && (-180...180).contains($0.lon)
        }
        guard valid.count > 1 else { return 0 }
        return zip(valid, valid.dropFirst()).reduce(0.0) { total, pair in
            let first = CLLocation(latitude: pair.0.lat, longitude: pair.0.lon)
            let second = CLLocation(latitude: pair.1.lat, longitude: pair.1.lon)
            let segment = first.distance(from: second)
            return total + (segment.isFinite ? segment : 0)
        }
    }

    private var watchCounts: [WatchCountRow] {
        let grouped = Dictionary(grouping: ride.watchSamples ?? [], by: \.kind)
        return WatchSensorSample.Kind.allCases.compactMap { kind in
            guard let count = grouped[kind]?.count, count > 0 else { return nil }
            return WatchCountRow(kind: kind, count: count)
        }
    }

    var body: some View {
        List {
            Section("Zusammenfassung") {
                LabeledContent("Datum", value: Date(timeIntervalSince1970: ride.startedAt).formatted(date: .long, time: .shortened))
                LabeledContent("Status", value: ride.status.capitalized)
                LabeledContent("Dauer", value: durationText)
                LabeledContent("GPS-Strecke", value: String(format: "%.2f km", distanceMeters / 1_000))
                LabeledContent("GPS-Punkte", value: String(ride.points.count))
            }
            Section("Höhenanalyse") {
                LabeledContent("Referenz", value: analysis.reference.rawValue)
                LabeledContent("Aufstieg", value: String(format: "%.0f m", analysis.ascentM))
                LabeledContent("Abstieg", value: String(format: "%.0f m", analysis.descentM))
                LabeledContent("GPS-Referenzpaare", value: String(analysis.gpsAnchorCount))
                LabeledContent("Steigungsabschnitte", value: String(analysis.slopeProfile.count))
                if let uphill = analysis.maxUphillGradePercent {
                    LabeledContent("Größte Steigung", value: String(format: "%.1f %%", uphill))
                }
                if let downhill = analysis.maxDownhillGradePercent {
                    LabeledContent("Größtes Gefälle", value: String(format: "%.1f %%", downhill))
                }
                Text("Steigung und Gefälle werden über mindestens 20 m Streckenfenster berechnet. Sensor-Sitzungen, GPS-Lücken über 30 s und isolierte Höhensprünge über 8 m werden nicht überbrückt. Die Strecke bleibt bei GPS-Lücken eine Näherung.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Apple Watch") {
                if watchCounts.isEmpty {
                    Text("Keine Watch-Messwerte gespeichert.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(watchCounts) { item in
                        LabeledContent(item.kind.rawValue, value: String(item.count))
                    }
                }
            }
            Section("Rohdaten") {
                LabeledContent("Barometerproben", value: String((ride.barometerSamples ?? []).count))
                LabeledContent("Watch-Proben", value: String((ride.watchSamples ?? []).count))
                Text("Originalmesswerte bleiben getrennt von den abgeleiteten Analysewerten.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle(ride.name?.isEmpty == false ? ride.name! : "Tour")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var durationText: String {
        let total = Int(durationSeconds)
        return String(format: "%02d:%02d:%02d", total / 3_600, (total % 3_600) / 60, total % 60)
    }
}

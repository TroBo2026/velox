import Foundation

@main
struct RideStoreValidation {
    static func main() async throws {
        let fileManager = FileManager.default
        let directory = fileManager.temporaryDirectory
            .appendingPathComponent("VELOX-RideStore-\(UUID().uuidString)", isDirectory: true)
        let archiveURL = directory.appendingPathComponent("Rides-v1.json")
        defer { try? fileManager.removeItem(at: directory) }

        let store = RideStore(fileURL: archiveURL)
        let original = makeRide(id: "store-ride-1", startedAt: 1_795_000_000)
        try await store.insert(original)
        let afterInsert = try await store.loadAll()
        expect(afterInsert.count == 1, "insert persists one ride")

        var attemptedOverwrite = original
        attemptedOverwrite.name = "must-not-overwrite"
        var duplicateRejected = false
        do {
            try await store.insert(attemptedOverwrite)
        } catch {
            duplicateRejected = true
        }
        expect(duplicateRejected, "duplicate ride ID is rejected")
        let afterDuplicate = try await store.loadAll()
        expect(afterDuplicate.first?.name == nil, "duplicate insert leaves original ride unchanged")

        var edited = original
        edited.name = "updated ride"
        try await store.replace(edited)
        let afterReplace = try await store.loadAll()
        expect(afterReplace.first?.name == "updated ride", "replace updates exact existing ride")

        let missingRide = makeRide(id: "does-not-exist", startedAt: 1_795_200_000)
        var missingReplacementRejected = false
        do {
            try await store.replace(missingRide)
        } catch {
            missingReplacementRejected = true
        }
        expect(missingReplacementRejected, "replace cannot create a missing ride")

        var invalid = edited
        invalid.points = [RidePoint(
            lat: 91, lon: 13, t: 1_795_000_001,
            alt: nil, altAccuracy: nil, altSource: nil, pressureKPa: nil, accuracy: 5
        )]
        var invalidRejected = false
        do {
            try await store.replace(invalid)
        } catch {
            invalidRejected = true
        }
        expect(invalidRejected, "invalid replacement is rejected")
        let afterInvalidReplace = try await store.loadAll()
        expect(afterInvalidReplace.first?.name == "updated ride", "invalid replacement cannot damage stored ride")

        let incoming = makeRide(id: "store-ride-1", startedAt: 1_795_100_000)
        let backup = try RideBackupCodec.exportBackup(rides: [incoming])
        let imported = try await store.importBackup(from: backup)
        expect(imported.remappedIDCount == 1, "backup import remaps existing ID collision")
        expect(imported.rides.first?.id != "store-ride-1", "imported ride receives a distinct ID")
        expect(imported.rides.first?.importedFromId == "store-ride-1", "original imported ID is retained as provenance")
        let finalRides = try await store.loadAll()
        expect(finalRides.count == 2, "backup import retains both rides")
        expect(finalRides.first(where: { $0.id == "store-ride-1" })?.name == "updated ride", "collision import never overwrites original")
        try await store.delete(id: imported.rides[0].id)
        let afterDelete = try await store.loadAll()
        expect(afterDelete.count == 1, "delete removes only the requested ride")
        expect(afterDelete.first?.id == "store-ride-1", "delete preserves the unrelated original ride")

        let corruptURL = directory.appendingPathComponent("Corrupt-v1.json")
        let corruptData = Data("{not valid json".utf8)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try corruptData.write(to: corruptURL)
        let corruptStore = RideStore(fileURL: corruptURL)
        var corruptRejected = false
        do {
            _ = try await corruptStore.loadAll()
        } catch {
            corruptRejected = true
        }
        expect(corruptRejected, "corrupt archive is reported")
        let preservedCorruptData = try Data(contentsOf: corruptURL)
        expect(preservedCorruptData == corruptData, "corrupt archive bytes remain untouched")

        print("VELOX local ride store validation: 16/16 checks passed")
    }

    private static func makeRide(id: String, startedAt: Double) -> Ride {
        Ride(
            id: id,
            name: nil,
            startedAt: startedAt,
            endedAt: startedAt + 60,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: [RidePoint(
                lat: 51, lon: 13, t: startedAt,
                alt: nil, altAccuracy: nil, altSource: nil, pressureKPa: nil, accuracy: 5
            )],
            barometerSamples: [],
            importedFromId: nil
        )
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else { fatalError("FAILED: " + message) }
    }
}

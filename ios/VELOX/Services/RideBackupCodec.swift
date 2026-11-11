import Foundation

/// The version-1 backup envelope used by the VELOX Web/PWA application.
struct RideBackupArchive: Codable {
    let app: String
    let version: Int
    let exportedAt: String
    let rides: [Ride]
}

struct RideImportResult {
    let rides: [Ride]
    let remappedIDCount: Int
}

/// Validates and converts VELOX JSON-v1 backups without touching a database.
/// The caller must persist the returned rides in one transaction.
enum RideBackupCodec {
    enum BackupError: LocalizedError {
        case invalidApplication
        case unsupportedVersion(Int)
        case invalidRide(index: Int, reason: String)

        var errorDescription: String? {
            switch self {
            case .invalidApplication:
                return "Die Datei ist keine VELOX-Sicherung."
            case .unsupportedVersion(let version):
                return "Die VELOX-Sicherungsversion \(version) wird nicht unterstützt."
            case .invalidRide(let index, let reason):
                return "Tour \(index + 1) ist ungültig: \(reason)"
            }
        }
    }

    /// Decodes a backup and remaps every ID that already exists locally or
    /// has appeared earlier in the same import. Existing rides are never changed.
    static func importBackup(
        from data: Data,
        existingIDs: Set<String>
    ) throws -> RideImportResult {
        let archive = try JSONDecoder().decode(RideBackupArchive.self, from: data)

        guard archive.app == "VELOX" else {
            throw BackupError.invalidApplication
        }
        guard archive.version == 1 else {
            throw BackupError.unsupportedVersion(archive.version)
        }

        var usedIDs = existingIDs
        var imported: [Ride] = []
        var remappedCount = 0

        for (index, sourceRide) in archive.rides.enumerated() {
            try validate(sourceRide, index: index)

            var ride = sourceRide
            let originalID = sourceRide.id
            if usedIDs.contains(originalID) {
                var candidate = "\(originalID)-import-\(UUID().uuidString)"
                while usedIDs.contains(candidate) {
                    candidate = "\(originalID)-import-\(UUID().uuidString)"
                }
                ride.id = candidate
                ride.importedFromId = originalID
                remappedCount += 1
            }

            usedIDs.insert(ride.id)
            imported.append(ride)
        }

        return RideImportResult(rides: imported, remappedIDCount: remappedCount)
    }

    /// Produces the same envelope and field names as the Web/PWA JSON-v1 export.
    static func exportBackup(rides: [Ride], exportedAt: Date = Date()) throws -> Data {
        let formatter = ISO8601DateFormatter()
        let archive = RideBackupArchive(
            app: "VELOX",
            version: 1,
            exportedAt: formatter.string(from: exportedAt),
            rides: rides
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(archive)
    }

    private static func validate(_ ride: Ride, index: Int) throws {
        guard !ride.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw BackupError.invalidRide(index: index, reason: "ID fehlt")
        }
        guard ride.startedAt.isFinite else {
            throw BackupError.invalidRide(index: index, reason: "Startzeit ist ungültig")
        }
        guard ride.endedAt?.isFinite ?? true,
              ride.pausedMs?.isFinite ?? true,
              ride.pauseStarted?.isFinite ?? true else {
            throw BackupError.invalidRide(index: index, reason: "Zeitangabe ist ungültig")
        }

        for point in ride.points {
            guard point.lat.isFinite, (-90.0...90.0).contains(point.lat),
                  point.lon.isFinite, (-180.0...180.0).contains(point.lon),
                  point.t.isFinite else {
                throw BackupError.invalidRide(index: index, reason: "GPS-Punkt enthält ungültige Koordinaten oder Zeit")
            }
            guard point.alt?.isFinite ?? true,
                  point.altAccuracy?.isFinite ?? true,
                  point.accuracy?.isFinite ?? true,
                  point.pressureKPa?.isFinite ?? true else {
                throw BackupError.invalidRide(index: index, reason: "Messwert ist nicht endlich")
            }
        }

        for sample in ride.barometerSamples ?? [] {
            guard sample.pressureKPa.isFinite, sample.pressureKPa > 0,
                  sample.relativeAltitudeM.isFinite,
                  sample.accuracyM?.isFinite ?? true else {
                throw BackupError.invalidRide(index: index, reason: "Barometer-Messwert ist ungültig")
            }
        }
    }
}

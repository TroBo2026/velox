import Foundation

/// Local, device-only ride archive.
///
/// Safety properties:
/// - A new ride is never allowed to replace an existing ID.
/// - Updating requires an existing ID.
/// - A corrupt archive is reported, never silently reset.
/// - Writes use Data.write(.atomic) to avoid partially written JSON.
actor RideStore {
    enum StoreError: LocalizedError {
        case duplicateID(String)
        case rideNotFound(String)
        case unsupportedVersion(Int)
        case invalidArchive

        var errorDescription: String? {
            switch self {
            case .duplicateID(let id):
                return "Eine Tour mit der ID \(id) existiert bereits."
            case .rideNotFound(let id):
                return "Die Tour \(id) wurde im Archiv nicht gefunden."
            case .unsupportedVersion(let version):
                return "Das Archivformat Version \(version) wird nicht unterstützt."
            case .invalidArchive:
                return "Das Tourenarchiv ist ungültig. Die vorhandene Datei wurde nicht verändert."
            }
        }
    }

    private struct Archive: Codable {
        let formatVersion: Int
        var rides: [Ride]
    }

    private let fileURL: URL
    private let fileManager: FileManager
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let currentFormatVersion = 1

    init(
        fileURL: URL? = nil,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            self.fileURL = base
                .appendingPathComponent("VELOX", isDirectory: true)
                .appendingPathComponent("Rides-v1.json", isDirectory: false)
        }

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        self.encoder = encoder
        self.decoder = JSONDecoder()
    }

    /// Returns an empty list only when no archive exists yet.
    /// Existing unreadable/corrupt archives throw and are never overwritten.
    func loadAll() throws -> [Ride] {
        guard fileManager.fileExists(atPath: fileURL.path) else { return [] }
        let data = try Data(contentsOf: fileURL)
        let archive: Archive
        do {
            archive = try decoder.decode(Archive.self, from: data)
        } catch {
            throw StoreError.invalidArchive
        }
        guard archive.formatVersion == currentFormatVersion else {
            throw StoreError.unsupportedVersion(archive.formatVersion)
        }
        guard Set(archive.rides.map(\.id)).count == archive.rides.count else {
            throw StoreError.invalidArchive
        }
        return archive.rides.sorted { $0.startedAt > $1.startedAt }
    }

    /// Inserts a new ride. Duplicate IDs are rejected, never overwritten.
    func insert(_ ride: Ride) throws {
        var rides = try loadAll()
        guard !rides.contains(where: { $0.id == ride.id }) else {
            throw StoreError.duplicateID(ride.id)
        }
        rides.append(ride)
        try persist(rides)
    }

    /// Replaces an existing ride only. This cannot create a new ID.
    func replace(_ ride: Ride) throws {
        var rides = try loadAll()
        guard let index = rides.firstIndex(where: { $0.id == ride.id }) else {
            throw StoreError.rideNotFound(ride.id)
        }
        rides[index] = ride
        try persist(rides)
    }

    /// Deletes only the exact requested ID.
    func delete(id: String) throws {
        var rides = try loadAll()
        guard rides.contains(where: { $0.id == id }) else {
            throw StoreError.rideNotFound(id)
        }
        rides.removeAll { $0.id == id }
        try persist(rides)
    }

    private func persist(_ rides: [Ride]) throws {
        let directory = fileURL.deletingLastPathComponent()
        try fileManager.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: nil
        )
        let archive = Archive(formatVersion: currentFormatVersion, rides: rides)
        let data = try encoder.encode(archive)
        try data.write(to: fileURL, options: .atomic)
    }
}

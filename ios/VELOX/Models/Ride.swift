import Foundation

/// Core fields compatible with existing VELOX ride records.
/// Optional native fields extend the format without requiring older Web/PWA
/// records to contain them.
struct Ride: Codable, Identifiable, Equatable {
    var id: String
    var name: String?
    var startedAt: Double
    var endedAt: Double?
    var pausedMs: Double?
    var pauseStarted: Double?
    var status: String
    var points: [RidePoint]
    var barometerSamples: [BarometerSample]?
    /// Original ID when an imported ride had to be remapped to avoid a collision.
    var importedFromId: String?

    enum CodingKeys: String, CodingKey {
        case id, name, startedAt, endedAt, pausedMs, pauseStarted
        case status, points, barometerSamples, importedFromId
    }
}

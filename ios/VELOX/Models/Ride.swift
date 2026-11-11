import Foundation

/// Core fields compatible with existing VELOX ride records.
/// Optional barometer samples extend the native format without requiring
/// older Web/PWA records to contain the new field.
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

    enum CodingKeys: String, CodingKey {
        case id, name, startedAt, endedAt, pausedMs, pauseStarted
        case status, points, barometerSamples
    }
}

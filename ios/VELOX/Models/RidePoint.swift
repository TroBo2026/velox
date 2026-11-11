import Foundation

/// GPS point using the same key names as the existing VELOX JSON-v1 format.
struct RidePoint: Codable, Equatable {
    let lat: Double
    let lon: Double
    let t: Double
    var alt: Double?
    var altAccuracy: Double?
    var altSource: String?
    var pressureKPa: Double?
    var accuracy: Double?
}

import Combine
import CoreMotion
import Foundation

/// Reads the iPhone's physical barometer through Apple's Core Motion API.
/// The service never fabricates samples when the hardware is unavailable.
@MainActor
final class BarometerService: ObservableObject {
    @Published private(set) var isAvailable: Bool
    @Published private(set) var isRecording = false
    @Published private(set) var latestSample: BarometerSample?
    @Published private(set) var errorMessage: String?

    private let altimeter = CMAltimeter()
    private(set) var activeSessionID: UUID?

    init() {
        isAvailable = CMAltimeter.isRelativeAltitudeAvailable()
    }

    func start() {
        guard isAvailable else {
            errorMessage = "Dieses iPhone stellt keinen unterstützten Barometersensor bereit."
            return
        }
        guard !isRecording else { return }

        errorMessage = nil
        isRecording = true
        let sessionID = UUID()
        activeSessionID = sessionID

        // Establish one wall-clock/uptime anchor per sensor session. Recomputing
        // this offset for every callback would introduce small timing jitter and
        // could misalign GPS/barometer pairing if the system clock changes.
        let unixTimeAtSessionStart = Date().timeIntervalSince1970
        let uptimeAtSessionStart = ProcessInfo.processInfo.systemUptime

        altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, error in
            let errorText = error?.localizedDescription
            let pressure = data?.pressure.doubleValue
            let relativeAltitude = data?.relativeAltitude.doubleValue
            // Core Motion timestamps samples on the monotonic uptime clock.
            // Map them to Unix time using the stable session anchor, not callback time.
            let sampleTimestamp = data.map {
                unixTimeAtSessionStart + ($0.timestamp - uptimeAtSessionStart)
            }
            let timestamp = sampleTimestamp.map { Int64(($0 * 1_000).rounded()) } ?? 0

            Task { @MainActor in
                guard let self, self.activeSessionID == sessionID else { return }
                if let errorText {
                    self.errorMessage = "Barometerdaten nicht verfügbar: \(errorText)"
                    self.altimeter.stopRelativeAltitudeUpdates()
                    self.isRecording = false
                    self.activeSessionID = nil
                    return
                }
                guard let pressure, let relativeAltitude,
                      pressure.isFinite, pressure > 0,
                      relativeAltitude.isFinite else {
                    return
                }

                self.latestSample = BarometerSample(
                    pressureKPa: pressure,
                    relativeAltitudeM: relativeAltitude,
                    timestampMs: timestamp,
                    sessionID: sessionID
                )
            }
        }
    }

    func stop() {
        guard isRecording else { return }
        altimeter.stopRelativeAltitudeUpdates()
        isRecording = false
        activeSessionID = nil
    }
}

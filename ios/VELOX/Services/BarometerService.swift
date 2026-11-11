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
        altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, error in
            let errorText = error?.localizedDescription
            let pressure = data?.pressure.doubleValue
            let relativeAltitude = data?.relativeAltitude.doubleValue
            // Core Motion timestamps samples on the device's monotonic uptime clock.
            // Convert that sample time to Unix milliseconds instead of stamping
            // callback delivery time, which may be delayed by the main queue.
            let sampleTimestamp = data.map {
                Date().timeIntervalSince1970
                    - ProcessInfo.processInfo.systemUptime
                    + $0.timestamp
            }
            let timestamp = sampleTimestamp.map { Int64(($0 * 1_000).rounded()) } ?? 0

            Task { @MainActor in
                guard let self else { return }
                if let errorText {
                    self.errorMessage = "Barometerdaten nicht verfügbar: \(errorText)"
                    self.altimeter.stopRelativeAltitudeUpdates()
                    self.isRecording = false
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
                    timestampMs: timestamp
                )
            }
        }
    }

    func stop() {
        guard isRecording else { return }
        altimeter.stopRelativeAltitudeUpdates()
        isRecording = false
    }
}

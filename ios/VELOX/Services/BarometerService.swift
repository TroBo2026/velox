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
            let timestamp = Int64(Date().timeIntervalSince1970 * 1_000)

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

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
        altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, error in
            Task { @MainActor in
                guard let self else { return }
                if let error {
                    self.errorMessage = "Barometerdaten nicht verfügbar: \(error.localizedDescription)"
                    self.isRecording = false
                    return
                }
                guard let data else { return }

                let pressure = data.pressure.doubleValue
                let relativeAltitude = data.relativeAltitude.doubleValue
                guard pressure.isFinite, pressure > 0, relativeAltitude.isFinite else {
                    return
                }

                self.latestSample = BarometerSample(
                    pressureKPa: pressure,
                    relativeAltitudeM: relativeAltitude,
                    timestampMs: Int64(Date().timeIntervalSince1970 * 1_000)
                )
                self.isRecording = true
            }
        }
    }

    func stop() {
        guard isRecording else { return }
        altimeter.stopRelativeAltitudeUpdates()
        isRecording = false
    }
}

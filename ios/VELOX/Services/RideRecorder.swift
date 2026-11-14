import Combine
import CoreLocation
import Foundation

/// Foreground-first GPS recorder. It only requests location after the user taps Start.
/// GPS and barometer observations are persisted locally with their original timestamps.
@MainActor
final class RideRecorder: NSObject, ObservableObject {
    enum State: String {
        case idle
        case requestingPermission
        case recording
        case paused
        case failed
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var authorization: CLAuthorizationStatus
    @Published private(set) var currentRide: Ride?
    @Published private(set) var distanceMeters: Double = 0
    @Published private(set) var lastAccuracyMeters: Double?
    @Published private(set) var message = "Noch keine Tour gestartet."
    @Published private(set) var persistenceError: String?

    let barometer = BarometerService()

    private let manager = CLLocationManager()
    private let store: RideStore
    private var lastAcceptedLocation: CLLocation?
    private var persistenceTask: Task<Void, Never>?
    private var barometerSubscription: AnyCancellable?

    init(store: RideStore = RideStore()) {
        self.store = store
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 3
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
        // Deliberately no background updates or Always permission in this first stage.
        manager.allowsBackgroundLocationUpdates = false

        barometerSubscription = barometer.$latestSample
            .compactMap { $0 }
            .sink { [weak self] sample in
                Task { @MainActor in
                    self?.acceptBarometer(sample)
                }
            }
    }

    var elevationSummary: RideElevationSummary {
        RideElevationSummary(samples: currentRide?.barometerSamples ?? [])
    }

    var elevationAnalysis: RideElevationAnalysis {
        RideElevationAnalysis(ride: currentRide)
    }

    func start() {
        guard state == .idle || (state == .failed && currentRide == nil) else { return }
        persistenceError = nil
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            beginNewRide()
        case .notDetermined:
            state = .requestingPermission
            message = "Standortfreigabe wird angefragt."
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            state = .failed
            message = "Standortzugriff ist gesperrt. Bitte in iOS-Einstellungen prüfen."
        @unknown default:
            state = .failed
            message = "Standortfreigabe konnte nicht geprüft werden."
        }
    }

    func pause() {
        guard state == .recording, var ride = currentRide else { return }
        manager.stopUpdatingLocation()
        let now = Date().timeIntervalSince1970
        ride.status = "paused"
        ride.pauseStarted = now
        currentRide = ride
        state = .paused
        message = "Tour pausiert. Barometer läuft weiter; Messwerte werden während der Pause nicht übernommen."
        persist(ride)
    }

    func resume() {
        guard state == .paused, var ride = currentRide else { return }
        let now = Date().timeIntervalSince1970
        if let pauseStarted = ride.pauseStarted {
            ride.pausedMs = (ride.pausedMs ?? 0) + max(0, (now - pauseStarted) * 1_000)
        }
        ride.pauseStarted = nil
        ride.status = "recording"
        currentRide = ride
        state = .recording
        message = "Tour läuft. GPS- und Barometerdaten werden lokal gespeichert."
        if barometer.isAvailable && !barometer.isRecording { barometer.start() }
        manager.startUpdatingLocation()
        persist(ride)
    }

    func stop() {
        guard state == .recording || state == .paused, var ride = currentRide else { return }
        manager.stopUpdatingLocation()
        barometer.stop()
        if let pauseStarted = ride.pauseStarted {
            ride.pausedMs = (ride.pausedMs ?? 0) + max(0, (Date().timeIntervalSince1970 - pauseStarted) * 1_000)
        }
        ride.pauseStarted = nil
        ride.endedAt = Date().timeIntervalSince1970
        ride.status = "completed"
        currentRide = ride
        state = .idle
        message = "Tour beendet und lokal gespeichert."
        persist(ride)
        lastAcceptedLocation = nil
    }

    private func beginNewRide() {
        let now = Date().timeIntervalSince1970
        let ride = Ride(
            id: UUID().uuidString,
            name: nil,
            startedAt: now,
            endedAt: nil,
            pausedMs: 0,
            pauseStarted: nil,
            status: "recording",
            points: [],
            barometerSamples: [],
            importedFromId: nil
        )
        currentRide = ride
        distanceMeters = 0
        lastAccuracyMeters = nil
        lastAcceptedLocation = nil
        state = .recording
        message = "Tour wird lokal angelegt. Sensoren starten nach erfolgreicher Speicherung."
        persist(ride, inserting: true, startGPSAfterInsert: true)
    }

    private func accept(_ location: CLLocation) {
        guard state == .recording, var ride = currentRide else { return }
        let now = Date()
        guard location.horizontalAccuracy >= 0,
              location.horizontalAccuracy <= 35,
              abs(location.timestamp.timeIntervalSince(now)) <= 10,
              location.coordinate.latitude.isFinite,
              location.coordinate.longitude.isFinite,
              (-90...90).contains(location.coordinate.latitude),
              (-180...180).contains(location.coordinate.longitude) else {
            return
        }

        if let previous = lastAcceptedLocation {
            let segment = location.distance(from: previous)
            guard segment >= 2, segment <= 120 else { return }
            distanceMeters += segment
        }

        let altitudeIsValid = location.verticalAccuracy >= 0 && location.altitude.isFinite
        let point = RidePoint(
            lat: location.coordinate.latitude,
            lon: location.coordinate.longitude,
            t: location.timestamp.timeIntervalSince1970,
            alt: altitudeIsValid ? location.altitude : nil,
            altAccuracy: altitudeIsValid ? location.verticalAccuracy : nil,
            altSource: altitudeIsValid ? "coreLocation" : nil,
            pressureKPa: nil,
            accuracy: location.horizontalAccuracy
        )
        ride.points.append(point)
        currentRide = ride
        lastAcceptedLocation = location
        lastAccuracyMeters = location.horizontalAccuracy
        message = "Aufzeichnung aktiv · GPS ±\(Int(location.horizontalAccuracy.rounded())) m"
        persist(ride)
    }

    private func acceptBarometer(_ sample: BarometerSample) {
        guard state == .recording, var ride = currentRide,
              sample.timestampMs > 0,
              sample.pressureKPa.isFinite, sample.pressureKPa > 0,
              sample.relativeAltitudeM.isFinite else { return }
        if let last = ride.barometerSamples?.last,
           sample.timestampMs <= last.timestampMs { return }
        ride.barometerSamples = (ride.barometerSamples ?? []) + [sample]
        currentRide = ride
        persist(ride)
    }

    private func persist(_ ride: Ride, inserting: Bool = false, startGPSAfterInsert: Bool = false) {
        // Chain writes so rapid GPS/barometer callbacks cannot overtake one another.
        let previousWrite = persistenceTask
        persistenceTask = Task { [weak self] in
            await previousWrite?.value
            guard let self else { return }
            do {
                if inserting {
                    try await store.insert(ride)
                } else {
                    try await store.replace(ride)
                }
                persistenceError = nil
                if startGPSAfterInsert, state == .recording, currentRide?.id == ride.id {
                    if barometer.isAvailable { barometer.start() }
                    manager.startUpdatingLocation()
                    message = barometer.isAvailable
                        ? "GPS- und Barometeraufzeichnung aktiv. Daten werden lokal gespeichert."
                        : "GPS-Aufzeichnung aktiv. Auf diesem iPhone ist kein Barometer verfügbar."
                }
            } catch {
                persistenceError = error.localizedDescription
                message = "Speicherfehler – Aufzeichnung aus Sicherheitsgründen gestoppt: \(error.localizedDescription)"
                manager.stopUpdatingLocation()
                barometer.stop()
                state = .failed
                // Keep currentRide in memory; never discard the last recoverable state.
            }
        }
    }
}

extension RideRecorder: CLLocationManagerDelegate {
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorization = manager.authorizationStatus
        guard state == .requestingPermission else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            beginNewRide()
        case .denied, .restricted:
            state = .failed
            message = "Standortzugriff wurde nicht erteilt."
        case .notDetermined:
            break
        @unknown default:
            state = .failed
            message = "Unbekannter Standortstatus."
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations { accept(location) }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        message = "GPS-Fehler: \(error.localizedDescription)"
    }
}

import Combine
import Foundation
import WatchConnectivity

/// iPhone-side durable transport for the VELOX watchOS companion.
/// Watch samples are accepted only with a real timestamp, known sensor kind,
/// allowed source and matching ride ID. No missing timestamp is fabricated.
final class WatchConnectivityService: NSObject, ObservableObject {
    @Published private(set) var isSupported = WCSession.isSupported()
    @Published private(set) var isPaired = false
    @Published private(set) var isWatchAppInstalled = false
    @Published private(set) var isReachable = false
    @Published private(set) var latestSample: WatchSensorSample?
    @Published private(set) var latestSamples: [WatchSensorSample.Kind: WatchSensorSample] = [:]
    @Published private(set) var latestCommand: WatchRideCommand?
    @Published private(set) var statusMessage = "Apple Watch wird geprüft."

    var latestHeartRateBPM: Double? {
        latestSamples[.heartRateBPM]?.value
    }

    var lastHeartRateDate: Date? {
        guard let sample = latestSamples[.heartRateBPM] else { return nil }
        return Date(timeIntervalSince1970: Double(sample.timestampMs) / 1_000)
    }

    private var handledCommandIDs = Set<String>()
    private let session: WCSession? = WCSession.isSupported() ? WCSession.default : nil

    override init() {
        super.init()
        guard let session else {
            statusMessage = "WatchConnectivity wird auf diesem Gerät nicht unterstützt."
            return
        }
        session.delegate = self
        session.activate()
    }

    func refreshStatus() {
        guard let session else { return }
        DispatchQueue.main.async {
            self.isPaired = session.isPaired
            self.isWatchAppInstalled = session.isWatchAppInstalled
            self.isReachable = session.isReachable
            if !session.isPaired {
                self.statusMessage = "Keine gekoppelte Apple Watch erkannt."
            } else if !session.isWatchAppInstalled {
                self.statusMessage = "Watch gekoppelt; VELOX Watch-App ist noch nicht installiert."
            } else if session.isReachable {
                self.statusMessage = "VELOX Watch ist verbunden."
            } else {
                self.statusMessage = "Watch-App installiert; Verbindung derzeit nicht erreichbar."
            }
        }
    }

    /// Latest-value channel for ride state; not used for lossless sensor samples.
    func updateRideSnapshot(rideID: String?, distanceMeters: Double, rideState: String) {
        guard let session, session.activationState == .activated,
              distanceMeters.isFinite, distanceMeters >= 0 else { return }

        var context: [String: Any] = [
            "schemaVersion": 1,
            "distanceMeters": distanceMeters,
            "rideState": rideState,
            "updatedAt": Date().timeIntervalSince1970
        ]
        if let rideID, !rideID.isEmpty { context["rideID"] = rideID }
        do {
            try session.updateApplicationContext(context)
        } catch {
            DispatchQueue.main.async {
                self.statusMessage = "Watch-Synchronisierung fehlgeschlagen: \(error.localizedDescription)"
            }
        }
    }

    private func accept(payload: [String: Any]) {
        if let command = WatchRideCommand(payload: payload) {
            guard handledCommandIDs.insert(command.id).inserted else { return }
            if handledCommandIDs.count > 256 {
                handledCommandIDs.removeAll(keepingCapacity: true)
                handledCommandIDs.insert(command.id)
            }
            DispatchQueue.main.async {
                self.latestCommand = command
            }
            return
        }
        guard let sample = WatchSensorSample(payload: payload) else { return }
        DispatchQueue.main.async {
            self.latestSample = sample
            self.latestSamples[sample.kind] = sample
        }
    }
}

extension WatchConnectivityService: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        refreshStatus()
        if let error {
            DispatchQueue.main.async {
                self.statusMessage = "Watch-Aktivierung fehlgeschlagen: \(error.localizedDescription)"
            }
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {
        refreshStatus()
    }

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
        refreshStatus()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        refreshStatus()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        accept(payload: message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        accept(payload: message)
        replyHandler(["received": true])
    }

    /// Reliable queued delivery for sensor samples when the iPhone isn't reachable.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        accept(payload: userInfo)
    }
}

import SwiftUI

@main
struct VELOXWatchApp: App {
    @StateObject private var workout = WatchWorkoutManager()

    var body: some Scene {
        WindowGroup {
            WatchRideView(workout: workout)
                .task { workout.activateConnectivity() }
        }
    }
}

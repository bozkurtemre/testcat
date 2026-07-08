import ArgumentParser

@main
struct Baguette: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "testcat-sim",
        abstract: "Headless iOS simulator control (testcat)",
        version: baguetteVersion,
        subcommands: [
            ListCommand.self,
            BootCommand.self,
            ShutdownCommand.self,
            InstallCommand.self,
            LaunchAppCommand.self,
            TerminateAppCommand.self,
            UninstallCommand.self,
            CompleteCommand.self,
            InputCommand.self,
            StreamCommand.self,
            ScreencastCommand.self,
            TapCommand.self,
            DoubleTapCommand.self,
            SwipeCommand.self,
            PinchCommand.self,
            PanCommand.self,
            PressCommand.self,
            KeyCommand.self,
            TypeCommand.self,
            ChromeCommand.self,
            ScreenshotCommand.self,
            DescribeUICommand.self,
            LogsCommand.self,
            OrientationCommand.self,
            StatusBarCommand.self,
            DiagDigitizerTrackpadCommand.self,
        ]
    )
}

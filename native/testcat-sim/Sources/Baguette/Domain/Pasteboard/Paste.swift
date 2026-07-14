import Foundation

/// Paste text into the frontmost app. Sets the simulator's
/// pasteboard, then presses Cmd+V so iOS pastes it — the
/// arbitrary-unicode path that `type`'s US-ASCII keystroke
/// decomposition can't cover. `press: false` stops after the
/// pasteboard set, for apps that read `UIPasteboard` directly.
///
/// Fork note: upstream also exposes this over the `input` stdin /
/// serve WS wire (`PasteDispatch` + `parse`); this fork ports only
/// the CLI surface, so the wire-parsing half is omitted.
struct Paste: Equatable, Sendable {
    let text: String
    let press: Bool

    init(text: String, press: Bool = true) {
        self.text = text
        self.press = press
    }

    /// Set the pasteboard, then (when `press`) Cmd+V. Throws the
    /// pasteboard's failure before any keystroke is sent; returns
    /// the key press's success flag (`true` when `press` is false).
    func execute(pasteboard: any Pasteboard, input: any Input) async throws -> Bool {
        try await pasteboard.setText(text)
        guard press else { return true }
        return KeyboardKey.from(wireCode: "KeyV")!
            .press(modifiers: [.command], on: input)
    }
}

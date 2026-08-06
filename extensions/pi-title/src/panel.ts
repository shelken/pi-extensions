import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, Text, type Component } from "@earendil-works/pi-tui";

/**
 * Wrap an inner component in a titled bordered floating panel (same shape as
 * pi-codebuddy-provider's settings overlay). Keys from the inner component are
 * forwarded; Esc handling lives in the inner component's handleInput.
 */
export function borderedPanel(title: string, inner: Component): Component {
	const container = new Container();
	container.addChild(new DynamicBorder((s: string) => s));
	container.addChild(new Text(title, 1, 0));
	container.addChild(inner);
	container.addChild(new DynamicBorder((s: string) => s));

	return {
		render(width: number): string[] {
			return container.render(width);
		},
		invalidate(): void {
			container.invalidate();
		},
		handleInput(data: string): void {
			inner.handleInput?.(data);
		},
	};
}

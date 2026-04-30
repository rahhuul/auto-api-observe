import React from "react";
import {
	useCurrentFrame,
	useVideoConfig,
	interpolate,
	Easing,
	spring,
	Img,
	staticFile,
} from "remotion";

// ── Brand ────────────────────────────────────────────────
const BRAND = {
	navy: "#0a0e1a",
	navyLight: "#0f1629",
	cyan: "#00D4FF",
	white: "#FFFFFF",
	gridLine: "#1a2035",
	grayDim: "#2a3040",
	grayMuted: "#4a5568",
	grayLight: "#a0aec0",
	blue: "#63b3ed",
	green: "#48bb78",
	red: "#fc5c65",
	amber: "#ffd43b",
	font: '"JetBrains Mono", monospace',
	fontDisplay: '"Inter", sans-serif',
};

// ── Helpers ──────────────────────────────────────────────
const fade = (
	frame: number,
	inStart: number,
	inEnd: number,
	outStart?: number,
	outEnd?: number,
) => {
	if (outStart !== undefined && outEnd !== undefined) {
		return interpolate(
			frame,
			[inStart, inEnd, outStart, outEnd],
			[0, 1, 1, 0],
			{
				extrapolateLeft: "clamp",
				extrapolateRight: "clamp",
				easing: Easing.out(Easing.cubic),
			},
		);
	}
	return interpolate(frame, [inStart, inEnd], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.out(Easing.cubic),
	});
};

const slideY = (frame: number, startFrame: number, duration = 15, dist = 24) =>
	interpolate(frame, [startFrame, startFrame + duration], [dist, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.out(Easing.cubic),
	});

// ── Background ────────────────────────────────────────────
const Background: React.FC = () => (
	<div
		style={{
			position: "absolute",
			inset: 0,
			background: BRAND.navy,
		}}
	>
		<div
			style={{
				position: "absolute",
				inset: 0,
				backgroundImage: `
          linear-gradient(${BRAND.gridLine} 1px, transparent 1px),
          linear-gradient(90deg, ${BRAND.gridLine} 1px, transparent 1px)
        `,
				backgroundSize: "40px 40px",
				opacity: 0.6,
			}}
		/>
	</div>
);

// ── Terminal / Setup Screen ───────────────────────────────
const SetupScreen: React.FC<{ exitStart: number; exitEnd: number }> = ({
	exitStart,
	exitEnd,
}) => {
	const frame = useCurrentFrame();

	const opacity = fade(frame, 0, 12, exitStart, exitEnd);

	// Typewriter lines
	const line1 = "$ npm install auto-api-observe";
	const line2 = "added 1 package in 2.3s";
	const line3 = "const observe = require('auto-api-observe');";
	const line4 = "app.use(observe({ apiKey: process.env.APILENS_KEY }));";

	const t1 = Math.min(line1.length, Math.round(interpolate(frame, [8, 28], [0, line1.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
	const showLine2 = frame >= 30;
	const showCode  = frame >= 36;
	const t3 = Math.min(line3.length, Math.round(interpolate(frame, [36, 52], [0, line3.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
	const t4 = Math.min(line4.length, Math.round(interpolate(frame, [53, 70], [0, line4.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
	const showDone  = frame >= 72;
	const doneOp    = fade(frame, 72, 80);
	const cursor    = frame % 10 < 5;

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				opacity,
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				alignItems: "center",
				padding: "0 48px",
			}}
		>
			{/* Terminal window */}
			<div
				style={{
					width: "100%",
					maxWidth: 560,
					background: "#1E293B",
					borderRadius: 12,
					overflow: "hidden",
					border: `1px solid ${BRAND.grayDim}`,
					boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
				}}
			>
				{/* Title bar */}
				<div
					style={{
						background: "#263244",
						padding: "10px 16px",
						display: "flex",
						gap: 7,
						alignItems: "center",
					}}
				>
					{[BRAND.red, BRAND.amber, BRAND.green].map((c, i) => (
						<span
							key={i}
							style={{ width: 12, height: 12, borderRadius: "50%", background: c, display: "block", opacity: 0.85 }}
						/>
					))}
					<span style={{ marginLeft: 10, fontFamily: BRAND.font, fontSize: 12, color: BRAND.grayMuted }}>
						terminal — auto-api-observe setup
					</span>
				</div>

				{/* Terminal body */}
				<div style={{ padding: "20px 24px", fontFamily: BRAND.font, fontSize: 13.5, lineHeight: 1.9 }}>
					{/* npm install */}
					<div style={{ color: BRAND.grayLight }}>
						<span style={{ color: BRAND.green }}>$ </span>
						{line1.slice(0, t1)}
						{t1 < line1.length && cursor && (
							<span style={{ opacity: 1 }}>▋</span>
						)}
					</div>

					{showLine2 && t1 >= line1.length && (
						<div style={{ color: BRAND.green, fontSize: 12 }}>{line2}</div>
					)}

					{showCode && (
						<>
							<div style={{ marginTop: 14, color: BRAND.grayMuted, fontSize: 11 }}>// app.js</div>
							<div style={{ color: BRAND.blue }}>
								{line3.slice(0, t3)}
								{t3 < line3.length && cursor && <span>▋</span>}
							</div>
							{t3 >= line3.length && (
								<div style={{ color: BRAND.cyan }}>
									{line4.slice(0, t4)}
									{t4 < line4.length && cursor && <span>▋</span>}
								</div>
							)}
						</>
					)}
				</div>
			</div>

			{/* Done callout */}
			{showDone && (
				<div
					style={{
						marginTop: 22,
						opacity: doneOp,
						transform: `translateY(${slideY(frame, 72)  }px)`,
						fontFamily: BRAND.fontDisplay,
						fontSize: 15,
						color: BRAND.grayLight,
						textAlign: "center",
					}}
				>
					<span style={{ color: BRAND.cyan, marginRight: 6 }}>✓</span>
					That&apos;s it. Dashboard activates instantly →{" "}
					<span style={{ color: BRAND.cyan }}>apilens.rest</span>
				</div>
			)}
		</div>
	);
};

// ── Dashboard Screenshot Slide ────────────────────────────
const DashSlide: React.FC<{
	src: string;
	label: string;
	sublabel: string;
	badge: string;
	inFrame: number;
	outFrame?: number;
	outEnd?: number;
}> = ({ src, label, sublabel, badge, inFrame, outFrame, outEnd }) => {
	const frame = useCurrentFrame();

	const opacity =
		outFrame !== undefined && outEnd !== undefined
			? fade(frame, inFrame, inFrame + 15, outFrame, outEnd)
			: fade(frame, inFrame, inFrame + 15);

	const ty = slideY(frame, inFrame, 18, 20);

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				opacity,
				transform: `translateY(${ty}px)`,
			}}
		>
			{/* Screenshot fills the frame */}
			<Img
				src={staticFile(src)}
				style={{
					position: "absolute",
					inset: 0,
					width: "100%",
					height: "100%",
					objectFit: "cover",
					objectPosition: "top left",
				}}
			/>

			{/* Top gradient — space for label */}
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					height: "22%",
					background: `linear-gradient(${BRAND.navy}f0, transparent)`,
				}}
			/>

			{/* Bottom gradient — space for label */}
			<div
				style={{
					position: "absolute",
					bottom: 0,
					left: 0,
					right: 0,
					height: "22%",
					background: `linear-gradient(transparent, ${BRAND.navy}f5)`,
				}}
			/>

			{/* Badge (top-left) */}
			<div
				style={{
					position: "absolute",
					top: 18,
					left: 22,
					background: `${BRAND.cyan}22`,
					border: `1px solid ${BRAND.cyan}55`,
					borderRadius: 20,
					padding: "4px 12px",
					fontFamily: BRAND.font,
					fontSize: 11,
					color: BRAND.cyan,
					letterSpacing: 1,
				}}
			>
				{badge}
			</div>

			{/* Label (bottom-left) */}
			<div
				style={{
					position: "absolute",
					bottom: 20,
					left: 22,
					right: 22,
				}}
			>
				<div
					style={{
						fontFamily: BRAND.fontDisplay,
						fontSize: 20,
						fontWeight: 700,
						color: BRAND.white,
						lineHeight: 1.3,
					}}
				>
					{label}
				</div>
				<div
					style={{
						fontFamily: BRAND.fontDisplay,
						fontSize: 12,
						color: BRAND.grayLight,
						marginTop: 3,
					}}
				>
					{sublabel}
				</div>
			</div>
		</div>
	);
};

// ── Progress Dots ─────────────────────────────────────────
const ProgressDots: React.FC<{ active: number; total: number; opacity: number }> = ({
	active,
	total,
	opacity,
}) => (
	<div
		style={{
			position: "absolute",
			bottom: 8,
			left: "50%",
			transform: "translateX(-50%)",
			display: "flex",
			gap: 6,
			opacity,
		}}
	>
		{Array.from({ length: total }).map((_, i) => (
			<span
				key={i}
				style={{
					width: i === active ? 20 : 6,
					height: 6,
					borderRadius: 3,
					background: i === active ? BRAND.cyan : BRAND.grayDim,
					transition: "width 0.3s",
				}}
			/>
		))}
	</div>
);

// ── Outro / Brand Screen ──────────────────────────────────
const OutroScreen: React.FC<{ inFrame: number }> = ({ inFrame }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const opacity    = fade(frame, inFrame, inFrame + 15);
	const scaleVal   = spring({ frame: frame - inFrame, fps, config: { damping: 14, stiffness: 120 } });
	const subOpacity = fade(frame, inFrame + 12, inFrame + 22);
	const subY       = slideY(frame, inFrame + 12, 14, 12);

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				opacity,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 14,
			}}
		>
			<div
				style={{
					fontFamily: BRAND.fontDisplay,
					fontSize: 48,
					fontWeight: 800,
					color: BRAND.cyan,
					letterSpacing: 1,
					transform: `scale(${scaleVal})`,
				}}
			>
				apilens
				<span style={{ color: BRAND.grayLight, fontWeight: 400 }}>.rest</span>
			</div>

			<div
				style={{
					opacity: subOpacity,
					transform: `translateY(${subY}px)`,
					fontFamily: BRAND.fontDisplay,
					fontSize: 15,
					color: BRAND.grayLight,
					textAlign: "center",
					lineHeight: 1.6,
				}}
			>
				Free tier · No credit card · Setup in 60 seconds
				<br />
				<span style={{ color: BRAND.cyan, fontSize: 13 }}>
					Request logs · DB profiling · N+1 detection · Error tracking
				</span>
			</div>
		</div>
	);
};

// ═══════════════════════════════════════════════════════════
// MAIN COMPOSITION
// 180 frames @ 15fps = 12 seconds
// ═══════════════════════════════════════════════════════════
export const ApiLensDashboardShowcase: React.FC = () => {
	const frame = useCurrentFrame();

	// ── Timeline ──────────────────────────────────────────
	// 0–80:   Setup screen (terminal + code)
	// 75–115: Overview screenshot
	// 110–145: Requests screenshot
	// 140–168: Database screenshot
	// 163–180: Outro
	const T = {
		setup:    { in: 0,   outStart: 78,  outEnd: 88  },
		overview: { in: 75,  outStart: 113, outEnd: 120 },
		requests: { in: 108, outStart: 143, outEnd: 150 },
		database: { in: 138, outStart: 163, outEnd: 170 },
		outro:    { in: 163 },
	};

	// Active screenshot for progress dots (0-indexed, -1 = setup)
	const activeSlide =
		frame < T.overview.in  ? -1 :
		frame < T.requests.in  ?  0 :
		frame < T.database.in  ?  1 :
		frame >= T.outro.in    ? -1 : 2;

	const dotsOpacity = fade(frame, T.overview.in, T.overview.in + 15, T.outro.in, T.outro.in + 10);

	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				position: "relative",
				overflow: "hidden",
			}}
		>
			<Background />

			{/* Phase 1 — Setup */}
			<SetupScreen exitStart={T.setup.outStart} exitEnd={T.setup.outEnd} />

			{/* Phase 2 — Overview */}
			<DashSlide
				src="screenshots/overview.png"
				label="Real-time overview"
				sublabel="Total requests · Error rate · P95 latency · 6 interactive charts"
				badge="OVERVIEW"
				inFrame={T.overview.in}
				outFrame={T.overview.outStart}
				outEnd={T.overview.outEnd}
			/>

			{/* Phase 3 — Requests */}
			<DashSlide
				src="screenshots/requests.png"
				label="Every request logged"
				sublabel="Full DB query details · Trace IDs · Outbound HTTP calls · Filters"
				badge="REQUEST LOG"
				inFrame={T.requests.in}
				outFrame={T.requests.outStart}
				outEnd={T.requests.outEnd}
			/>

			{/* Phase 4 — Database */}
			<DashSlide
				src="screenshots/database.png"
				label="Auto DB profiling"
				sublabel="N+1 detection · Slow queries · Per-request query breakdown"
				badge="DATABASE"
				inFrame={T.database.in}
				outFrame={T.database.outStart}
				outEnd={T.database.outEnd}
			/>

			{/* Phase 5 — Outro */}
			<OutroScreen inFrame={T.outro.in} />

			{/* Progress dots (visible during screenshot phases) */}
			{activeSlide >= 0 && (
				<ProgressDots active={activeSlide} total={3} opacity={dotsOpacity} />
			)}
		</div>
	);
};

import React from "react";
import {
	useCurrentFrame,
	interpolate,
	Easing,
	spring,
	useVideoConfig,
} from "remotion";

// ─── Brand Constants ────────────────────────────────────
const BRAND = {
	navy: "#0a0e1a",
	cyan: "#00D4FF",
	white: "#FFFFFF",
	grayDim: "#2a3040",
	grayMuted: "#4a5568",
	grayLight: "#a0aec0",
	blue: "#63b3ed",
	green: "#48bb78",
	red: "#f56565",
	amber: "#ecc94b",
	codeBg: "#1E293B",
	font: "JetBrains Mono, monospace",
	fontDisplay: "Inter, sans-serif",
};

// ─── Log Data ───────────────────────────────────────────
const LOG_ENTRIES = [
	{ method: "GET", path: "/api/users", status: 200, time: "12ms" },
	{ method: "POST", path: "/api/orders", status: 201, time: "45ms" },
	{ method: "GET", path: "/api/products?page=2", status: 200, time: "23ms" },
	{ method: "DELETE", path: "/api/sessions/x8k", status: 401, time: "8ms" },
	{ method: "PUT", path: "/api/users/142", status: 500, time: "340ms" },
	{ method: "GET", path: "/api/health", status: 200, time: "2ms" },
	{ method: "POST", path: "/api/auth/login", status: 200, time: "89ms" },
	{ method: "GET", path: "/api/analytics", status: 200, time: "156ms" },
	{ method: "PATCH", path: "/api/config", status: 403, time: "5ms" },
	{ method: "GET", path: "/api/webhooks", status: 200, time: "34ms" },
	{ method: "POST", path: "/api/payments", status: 201, time: "220ms" },
	{ method: "GET", path: "/api/users/142/orders", status: 200, time: "67ms" },
	{ method: "PUT", path: "/api/inventory/sku-991", status: 200, time: "31ms" },
	{ method: "GET", path: "/api/notifications", status: 429, time: "3ms" },
	{ method: "POST", path: "/api/reports/generate", status: 202, time: "510ms" },
];

const statusColor = (s: number) =>
	s < 300 ? BRAND.green : s < 400 ? BRAND.amber : BRAND.red;

const timestamp = (i: number) => {
	const h = 14;
	const m = 23;
	const s = 10 + i;
	const ms = ((i * 137) % 1000).toString().padStart(3, "0");
	return `${h}:${m}:${s < 60 ? s : s - 60}.${ms}`;
};

// ─── Single Log Line Component ──────────────────────────
const LogLine: React.FC<{
	entry: (typeof LOG_ENTRIES)[0];
	index: number;
	appearFrame: number;
	highlighted?: boolean;
	zoomed?: boolean;
}> = ({ entry, index, appearFrame, highlighted = false, zoomed = false }) => {
	const frame = useCurrentFrame();

	const opacity = interpolate(frame, [appearFrame, appearFrame + 6], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	const slideX = interpolate(frame, [appearFrame, appearFrame + 8], [-20, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.out(Easing.cubic),
	});

	const fontSize = zoomed ? 22 : 15;
	const lineHeight = zoomed ? 2.2 : 1.9;

	return (
		<div
			style={{
				opacity,
				transform: `translateX(${slideX}px)`,
				fontFamily: BRAND.font,
				fontSize,
				lineHeight,
				whiteSpace: "nowrap",
				display: "flex",
				gap: zoomed ? 16 : 10,
				color: highlighted ? BRAND.grayLight : BRAND.grayMuted,
				transition: "color 0.3s",
			}}
		>
			<span style={{ color: highlighted ? "#90cdf4" : BRAND.grayMuted }}>
				{timestamp(index)}
			</span>
			<span
				style={{
					color: highlighted ? "#90cdf4" : BRAND.blue,
					fontWeight: 600,
					minWidth: zoomed ? 80 : 55,
				}}
			>
				{entry.method}
			</span>
			<span style={{ color: highlighted ? "#e2e8f0" : BRAND.grayLight }}>
				{entry.path}
			</span>
			<span style={{ color: statusColor(entry.status), fontWeight: 600 }}>
				{entry.status}
			</span>
			<span style={{ color: highlighted ? "#a0aec0" : "#718096" }}>
				{entry.time}
			</span>
		</div>
	);
};

// ─── Scanline Effect ────────────────────────────────────
const Scanline: React.FC = () => {
	const frame = useCurrentFrame();
	const y = (frame * 2) % 600;

	return (
		<div
			style={{
				position: "absolute",
				top: y,
				left: 0,
				right: 0,
				height: 2,
				background: `linear-gradient(90deg, transparent, ${BRAND.cyan}40, transparent)`,
				zIndex: 5,
			}}
		/>
	);
};

// ─── Magnifier Lens ─────────────────────────────────────
const MagnifierLens: React.FC<{
	x: number;
	y: number;
	size: number;
	opacity: number;
	children: React.ReactNode;
}> = ({ x, y, size, opacity, children }) => {
	return (
		<div
			style={{
				position: "absolute",
				left: x - size / 2,
				top: y - size / 2,
				width: size,
				height: size,
				borderRadius: "50%",
				border: `3px solid ${BRAND.cyan}`,
				overflow: "hidden",
				zIndex: 10,
				opacity,
				boxShadow: `0 0 30px ${BRAND.cyan}30, inset 0 0 40px ${BRAND.cyan}10`,
			}}
		>
			<div
				style={{
					width: "100%",
					height: "100%",
					borderRadius: "50%",
					background: `${BRAND.navy}ee`,
					padding: 16,
					overflow: "hidden",
				}}
			>
				{children}
			</div>
		</div>
	);
};

// ─── Lens Handle ────────────────────────────────────────
const LensHandle: React.FC<{
	x: number;
	y: number;
	size: number;
	opacity: number;
}> = ({ x, y, size, opacity }) => {
	const handleLength = 60;
	const angle = Math.PI / 4; // 45 degrees
	const startX = x + (size / 2) * Math.cos(angle);
	const startY = y + (size / 2) * Math.sin(angle);
	const endX = startX + handleLength * Math.cos(angle);
	const endY = startY + handleLength * Math.sin(angle);

	return (
		<svg
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				width: "100%",
				height: "100%",
				zIndex: 11,
				opacity,
			}}
		>
			<line
				x1={startX}
				y1={startY}
				x2={endX}
				y2={endY}
				stroke={BRAND.cyan}
				strokeWidth={6}
				strokeLinecap="round"
			/>
			<circle cx={endX} cy={endY} r={8} fill={BRAND.cyan} opacity={0.6} />
		</svg>
	);
};

// ─── APILens Brand Text ─────────────────────────────────
const BrandTag: React.FC<{ appearFrame: number }> = ({ appearFrame }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const scaleSpring = spring({
		frame: frame - appearFrame,
		fps,
		config: { damping: 12 },
	});
	const opacity = interpolate(frame, [appearFrame, appearFrame + 10], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<div
			style={{
				position: "absolute",
				bottom: 40,
				right: 60,
				fontFamily: BRAND.fontDisplay,
				fontSize: 28,
				fontWeight: 700,
				color: BRAND.cyan,
				letterSpacing: 2,
				opacity,
				transform: `scale(${scaleSpring})`,
			}}
		>
			APILens
			<span
				style={{
					fontSize: 14,
					color: BRAND.grayLight,
					marginLeft: 8,
					fontWeight: 400,
				}}
			>
				.rest
			</span>
		</div>
	);
};

// ─── Tagline ────────────────────────────────────────────
const Tagline: React.FC<{ text: string; appearFrame: number }> = ({
	text,
	appearFrame,
}) => {
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [appearFrame, appearFrame + 15], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const y = interpolate(frame, [appearFrame, appearFrame + 15], [20, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.out(Easing.cubic),
	});

	return (
		<div
			style={{
				position: "absolute",
				bottom: 80,
				right: 60,
				fontFamily: BRAND.fontDisplay,
				fontSize: 16,
				color: BRAND.grayLight,
				opacity,
				transform: `translateY(${y}px)`,
				textAlign: "right",
			}}
		>
			{text}
		</div>
	);
};

// ═══════════════════════════════════════════════════════
// ─── MAIN COMPOSITION ─────────────────────────────────
// ═══════════════════════════════════════════════════════

export const ApiLensLogMagnifier: React.FC = () => {
	const frame = useCurrentFrame();
	const { width, height } = useVideoConfig();

	// ── Phase timing (in frames) ──
	const PHASE = {
		logsStart: 0, // Logs start appearing
		lensEnter: 30, // Lens enters (1s)
		lensSweep: 45, // Lens sweeps across logs (1.5s)
		lensZoomPause: 90, // Lens pauses on error log (3s)
		errorHighlight: 105, // Error highlighted (3.5s)
		brandReveal: 120, // APILens brand appears (4s)
		taglineReveal: 135, // Tagline appears (4.5s)
		endHold: 150, // Hold final frame (5s)
	};

	// ── Lens animation path ──
	// Enters from bottom-right, sweeps to error log, pauses
	const lensProgress = interpolate(
		frame,
		[PHASE.lensEnter, PHASE.lensSweep, PHASE.lensZoomPause, PHASE.endHold],
		[0, 0.3, 0.8, 1],
		{
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
			easing: Easing.inOut(Easing.cubic),
		},
	);

	// Lens position: sweeps from right side to the error log area
	const lensX = interpolate(
		lensProgress,
		[0, 0.3, 0.8, 1],
		[width * 0.85, width * 0.5, width * 0.45, width * 0.45],
	);
	const lensY = interpolate(
		lensProgress,
		[0, 0.3, 0.8, 1],
		[height * 0.8, height * 0.45, height * 0.4, height * 0.4],
	);

	// Lens size grows slightly when it finds the error
	const lensSize = interpolate(
		frame,
		[PHASE.lensEnter, PHASE.lensSweep, PHASE.lensZoomPause],
		[100, 160, 200],
		{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
	);

	// Lens opacity
	const lensOpacity = interpolate(
		frame,
		[PHASE.lensEnter, PHASE.lensEnter + 10],
		[0, 1],
		{
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
		},
	);

	// ── Which logs to show ──
	const visibleLogs = LOG_ENTRIES.slice(
		0,
		Math.min(12, Math.floor(frame / 5) + 4),
	);

	// Error log index (PUT /api/users/142 500)
	const errorIndex = 4;
	const isErrorHighlighted = frame >= PHASE.errorHighlight;

	// ── Glow pulse on error ──
	const glowPulse =
		frame >= PHASE.errorHighlight
			? interpolate(Math.sin(frame * 0.15), [-1, 1], [0.3, 0.8])
			: 0;

	return (
		<div
			style={{
				width,
				height,
				background: BRAND.navy,
				position: "relative",
				overflow: "hidden",
			}}
		>
			{/* Background grid pattern */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					backgroundImage: `
            linear-gradient(${BRAND.grayDim}15 1px, transparent 1px),
            linear-gradient(90deg, ${BRAND.grayDim}15 1px, transparent 1px)
          `,
					backgroundSize: "40px 40px",
				}}
			/>

			{/* Scanline */}
			<Scanline />

			{/* Log lines */}
			<div style={{ position: "absolute", top: 60, left: 60, right: 200 }}>
				{/* Terminal header */}
				<div
					style={{
						fontFamily: BRAND.fontDisplay,
						fontSize: 13,
						color: BRAND.grayMuted,
						marginBottom: 16,
						display: "flex",
						gap: 8,
						alignItems: "center",
					}}
				>
					<span
						style={{
							width: 10,
							height: 10,
							borderRadius: "50%",
							background: BRAND.red,
							opacity: 0.6,
						}}
					/>
					<span
						style={{
							width: 10,
							height: 10,
							borderRadius: "50%",
							background: BRAND.amber,
							opacity: 0.6,
						}}
					/>
					<span
						style={{
							width: 10,
							height: 10,
							borderRadius: "50%",
							background: BRAND.green,
							opacity: 0.6,
						}}
					/>
					<span style={{ marginLeft: 8 }}>api-server — live logs</span>
				</div>

				{/* Log entries */}
				{visibleLogs.map((entry, i) => (
					<LogLine
						key={i}
						entry={entry}
						index={i}
						appearFrame={i * 5}
						highlighted={isErrorHighlighted && i === errorIndex}
					/>
				))}

				{/* Error glow box */}
				{isErrorHighlighted && (
					<div
						style={{
							position: "absolute",
							top: 36 + errorIndex * 28.5,
							left: -8,
							right: -8,
							height: 30,
							border: `1px solid ${BRAND.red}`,
							borderRadius: 4,
							opacity: glowPulse,
							boxShadow: `0 0 15px ${BRAND.red}40`,
						}}
					/>
				)}
			</div>

			{/* Magnifier lens */}
			{frame >= PHASE.lensEnter && (
				<>
					<LensHandle
						x={lensX}
						y={lensY}
						size={lensSize}
						opacity={lensOpacity}
					/>
					<MagnifierLens
						x={lensX}
						y={lensY}
						size={lensSize}
						opacity={lensOpacity}
					>
						{/* Zoomed-in content inside lens */}
						<div
							style={{
								transform: "scale(1.3)",
								transformOrigin: "center center",
							}}
						>
							{visibleLogs
								.slice(Math.max(0, errorIndex - 1), errorIndex + 2)
								.map((entry, i) => (
									<LogLine
										key={i}
										entry={entry}
										index={errorIndex - 1 + i}
										appearFrame={0}
										highlighted={i === 1}
										zoomed
									/>
								))}
						</div>
					</MagnifierLens>
				</>
			)}

			{/* Brand */}
			<BrandTag appearFrame={PHASE.brandReveal} />
			<Tagline
				text="See everything. Fix faster."
				appearFrame={PHASE.taglineReveal}
			/>
		</div>
	);
};

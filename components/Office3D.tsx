"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox, SoftShadows } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useCompanyStore } from "@/lib/store";
import { DEPARTMENTS } from "@/lib/data";
import type { DepartmentId, Employee, OfficeSelection } from "@/lib/types";

// ================================================================
// トモコレ風トイ・パステルパレット
// ================================================================

const PALETTE = {
  floor: "#f2e7d5",
  floorLine: "#e3d3ba",
  wall: "#faf7f2",
  accentWall: "#f2b8a0",
  rugCorridor: "#dceef7",
  deskTop: "#ffffff",
  deskLeg: "#cbd5e1",
  chair: "#7dc4e8",
  chairDark: "#5aa9d6",
  sofa: "#8fd6c7",
  sofaDark: "#6fc2b0",
  meetingFloor: "#cfe3f5",
  loungeRug: "#fbd3dd",
  counter: "#f5e0c3",
  counterTop: "#ffffff",
};

// ================================================================
// レイアウト(床: 32 x 21)
// ================================================================

const DEPT_CENTERS: Record<DepartmentId, [number, number]> = {
  sales: [-9, -4.2],
  admin: [0, -4.2],
  marketing: [9, -4.2],
};

const DESK_SLOTS: [number, number][] = [
  [-1.7, 0],
  [1.7, 0],
  [-1.7, 2.8],
  [1.7, 2.8],
];

const MEETING_CENTER: [number, number] = [-7.5, 5.2];
const LOUNGE_CENTER: [number, number] = [9, 5.2];
const KITCHEN_CENTER: [number, number] = [0.5, 8.2];
const MEETING_D = 5.6;
const CORRIDOR_Z = 1.2; // 中央通路
const ENTRANCE: [number, number] = [4.5, 9.3]; // 入口(新入社員はここから歩いてくる)

const MEETING_SEATS: { pos: [number, number]; rot: number }[] = Array.from(
  { length: 6 },
  (_, i) => {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const r = 2.35;
    const x = MEETING_CENTER[0] + Math.cos(angle) * r;
    const z = MEETING_CENTER[1] + Math.sin(angle) * r;
    return { pos: [x, z], rot: Math.atan2(MEETING_CENTER[0] - x, MEETING_CENTER[1] - z) };
  }
);

const SOFA_Z = LOUNGE_CENTER[1] + 2.1;
const LOUNGE_SEATS: { pos: [number, number]; rot: number }[] = [
  { pos: [LOUNGE_CENTER[0] - 0.85, SOFA_Z], rot: Math.PI },
  { pos: [LOUNGE_CENTER[0] + 0.05, SOFA_Z], rot: Math.PI },
  { pos: [LOUNGE_CENTER[0] + 0.95, SOFA_Z], rot: Math.PI },
  { pos: [LOUNGE_CENTER[0] - 2.3, LOUNGE_CENTER[1] + 0.4], rot: Math.PI * 0.8 },
  { pos: [LOUNGE_CENTER[0] + 2.4, LOUNGE_CENTER[1] + 0.4], rot: -Math.PI * 0.8 },
];

function hash(str: string, mod: number): number {
  let h = 7;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 99991;
  return h % mod;
}

// ================================================================
// ロボットの個性
// ================================================================

type AntennaStyle = "single" | "double" | "loop" | "cap";
type DecalStyle = "circle" | "star" | "bolt" | "none";

interface RobotLook {
  antenna: AntennaStyle;
  decal: DecalStyle;
  accent: string;
  eyeColor: string;
  height: number;
  podSize: number;
}

const EYE_COLORS = ["#7dd3fc", "#a5f3fc", "#86efac", "#fde68a", "#f0abfc", "#93c5fd"];
const ANTENNAS: AntennaStyle[] = ["single", "double", "loop", "cap"];
const DECALS: DecalStyle[] = ["circle", "star", "bolt", "none"];

const ROBOT_OVERRIDES: Record<string, Partial<RobotLook>> = {
  "emp-sato": { antenna: "single", decal: "bolt", height: 1.1 },
  "emp-takahashi": { antenna: "double", decal: "circle", height: 0.95 },
  "emp-suzuki": { antenna: "loop", decal: "star", height: 1.0 },
  "emp-tanaka": { antenna: "cap", decal: "circle", height: 0.9 },
  "emp-ito": { antenna: "single", decal: "star", height: 1.12 },
  "emp-watanabe": { antenna: "loop", decal: "bolt", height: 0.97 },
};

function robotLookFor(emp: Employee): RobotLook {
  const base: RobotLook = {
    antenna: ANTENNAS[hash(emp.id + "ant", ANTENNAS.length)],
    decal: DECALS[hash(emp.id + "dec", DECALS.length)],
    accent: emp.color,
    eyeColor: EYE_COLORS[hash(emp.id + "eye", EYE_COLORS.length)],
    height: 0.9 + hash(emp.id + "h", 5) * 0.06,
    podSize: 0.9 + hash(emp.id + "pod", 3) * 0.15,
  };
  return { ...base, ...ROBOT_OVERRIDES[emp.id] };
}

// アバターがロボットか人間か(未設定はハッシュで半々に振り分け)
function avatarKindOf(emp: Employee): "robot" | "human" {
  if (emp.avatar) return emp.avatar;
  return hash(emp.id + "av", 2) === 0 ? "robot" : "human";
}

// ================================================================
// 人間(トモダチコレクション風Mii)の個性
// ================================================================

type HairStyle = "short" | "bob" | "pony" | "bun" | "spiky" | "bald";

interface HumanLook {
  skin: string;
  hairColor: string;
  hairStyle: HairStyle;
  shirt: string;
  glasses: boolean;
  height: number;
  blush: boolean;
}

const SKIN_TONES = ["#ffdcc0", "#f6c79c", "#e0a878", "#c88a5a"];
const HAIR_TONES = ["#2b2117", "#4a3220", "#6b4a2f", "#1a1a1a", "#8a6a3a", "#d9b382"];
const HAIR_STYLES: HairStyle[] = ["short", "bob", "pony", "bun", "spiky"];
const SHIRT_TONES = ["#f472b6", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#fb7185", "#38bdf8"];

const HUMAN_OVERRIDES: Record<string, Partial<HumanLook>> = {
  "emp-sato": { hairStyle: "short", glasses: false, height: 1.05 },
  "emp-takahashi": { hairStyle: "pony", glasses: false, height: 0.95, blush: true },
  "emp-tanaka": { hairStyle: "bob", glasses: false, height: 0.92, blush: true },
  "emp-watanabe": { hairStyle: "bun", glasses: true, height: 0.96 },
};

function humanLookFor(emp: Employee): HumanLook {
  const base: HumanLook = {
    skin: SKIN_TONES[hash(emp.id + "sk", SKIN_TONES.length)],
    hairColor: HAIR_TONES[hash(emp.id + "hc", HAIR_TONES.length)],
    hairStyle: HAIR_STYLES[hash(emp.id + "hs", HAIR_STYLES.length)],
    shirt: SHIRT_TONES[hash(emp.id + "sh", SHIRT_TONES.length)],
    glasses: hash(emp.id + "gl", 3) === 0,
    height: 0.9 + hash(emp.id + "hh", 5) * 0.05,
    blush: hash(emp.id + "bl", 2) === 0,
  };
  return { ...base, ...HUMAN_OVERRIDES[emp.id] };
}

// ================================================================
// 移動:目標位置とルート(瞬間移動しない)
// ================================================================

interface CharTarget {
  pos: [number, number, number];
  rotY: number;
  pose: "work" | "meeting" | "game" | "idle";
}

function homeDeskOf(emp: Employee, employees: Employee[]): [number, number] {
  const peers = employees.filter((e) => e.department === emp.department);
  const idx = peers.findIndex((e) => e.id === emp.id);
  const center = DEPT_CENTERS[emp.department];
  const slot = DESK_SLOTS[Math.max(idx, 0) % DESK_SLOTS.length];
  return [center[0] + slot[0], center[1] + slot[1]];
}

function computeTargets(
  employees: Employee[],
  meetingParticipantIds: string[]
): Map<string, CharTarget> {
  const targets = new Map<string, CharTarget>();
  let breakCounter = 0;

  for (const emp of employees) {
    if (emp.status === "meeting" && meetingParticipantIds.includes(emp.id)) {
      const i = meetingParticipantIds.indexOf(emp.id);
      const seat = MEETING_SEATS[i % MEETING_SEATS.length];
      targets.set(emp.id, {
        pos: [seat.pos[0], 0, seat.pos[1]],
        rotY: seat.rot,
        pose: "meeting",
      });
    } else if (emp.status === "break") {
      const seat = LOUNGE_SEATS[breakCounter % LOUNGE_SEATS.length];
      breakCounter++;
      targets.set(emp.id, {
        pos: [seat.pos[0], 0, seat.pos[1]],
        rotY: seat.rot,
        pose: "game",
      });
    } else {
      const [dx, dz] = homeDeskOf(emp, employees);
      targets.set(emp.id, {
        pos: [dx, 0, dz + 0.78],
        rotY: Math.PI,
        pose: "work",
      });
    }
  }
  return targets;
}

// 会議室エリア判定(ガラス張り・北側中央にドア)
const MEET_BOUNDS = {
  x0: MEETING_CENTER[0] - 3.6,
  x1: MEETING_CENTER[0] + 3.6,
  z0: MEETING_CENTER[1] - MEETING_D / 2,
  z1: MEETING_CENTER[1] + MEETING_D / 2,
};
const MEETING_DOOR: [number, number] = [MEETING_CENTER[0], MEET_BOUNDS.z0]; // ドア位置

function inMeetingRoom(x: number, z: number): boolean {
  return x > MEET_BOUNDS.x0 && x < MEET_BOUNDS.x1 && z > MEET_BOUNDS.z0 && z < MEET_BOUNDS.z1;
}

// 通路(z=1.2)とドアを経由するルートを組み立てる
function buildRoute(fromX: number, fromZ: number, to: [number, number]): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const push = (x: number, z: number) => pts.push(new THREE.Vector3(x, 0, z));
  const fromIn = inMeetingRoom(fromX, fromZ);
  const toIn = inMeetingRoom(to[0], to[1]);

  // 会議室から出る:まずドアへ
  if (fromIn && !toIn) {
    push(MEETING_DOOR[0], MEET_BOUNDS.z0 + 0.6);
    push(MEETING_DOOR[0], CORRIDOR_Z);
  }
  if (toIn && !fromIn) {
    // 会議室に入る:通路→ドア→中
    if (Math.abs(fromZ - CORRIDOR_Z) > 1.2) push(fromX, CORRIDOR_Z);
    push(MEETING_DOOR[0], CORRIDOR_Z);
    push(MEETING_DOOR[0], MEET_BOUNDS.z0 + 0.6);
  } else if (!fromIn && !toIn && Math.abs(fromZ - to[1]) > 3.2) {
    // 奥⇔手前の移動は中央通路を経由(デスク群を突っ切らない)
    push(fromX, CORRIDOR_Z);
    push(to[0], CORRIDOR_Z);
  }
  push(to[0], to[1]);
  return pts;
}

// タブ切替などで再マウントしても瞬間移動しないよう位置を記憶
const positionMemory = new Map<string, { x: number; z: number; ry: number }>();

// ================================================================
// ロボット社員
// ================================================================

function Antenna({ style, accent }: { style: AntennaStyle; accent: string }) {
  if (style === "single") {
    return (
      <group position={[0, 1.62, 0]}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.24, 8]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
        <mesh position={[0, 0.27, 0]}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} />
        </mesh>
      </group>
    );
  }
  if (style === "double") {
    return (
      <group position={[0, 1.6, 0]}>
        {[-0.12, 0.12].map((x) => (
          <group key={x} position={[x, 0, 0]} rotation={[0, 0, x < 0 ? 0.3 : -0.3]}>
            <mesh position={[0, 0.09, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.18, 8]} />
              <meshStandardMaterial color="#e2e8f0" />
            </mesh>
            <mesh position={[0, 0.2, 0]}>
              <sphereGeometry args={[0.035, 12, 12]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  if (style === "loop") {
    return (
      <mesh position={[0, 1.72, 0]}>
        <torusGeometry args={[0.09, 0.02, 12, 24]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} />
      </mesh>
    );
  }
  return (
    <mesh position={[0, 1.63, 0]}>
      <cylinderGeometry args={[0.09, 0.11, 0.06, 16]} />
      <meshStandardMaterial color={accent} />
    </mesh>
  );
}

function Decal({ style, accent }: { style: DecalStyle; accent: string }) {
  if (style === "none") return null;
  if (style === "circle") {
    return (
      <mesh position={[0, 0.58, 0.285]} rotation={[Math.PI / 2 - 0.25, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.01, 20]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} />
      </mesh>
    );
  }
  if (style === "star") {
    return (
      <mesh position={[0, 0.58, 0.29]} rotation={[0.25, 0, 0]}>
        <octahedronGeometry args={[0.07, 0]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} />
      </mesh>
    );
  }
  return (
    <group position={[0, 0.58, 0.29]} rotation={[0.25, 0, 0.5]}>
      <mesh>
        <boxGeometry args={[0.035, 0.13, 0.012]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.03, -0.02, 0]} rotation={[0, 0, -1.0]}>
        <boxGeometry args={[0.03, 0.08, 0.012]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

// つやつやトイ質感のボディ用マテリアル
function ToyMaterial({ color }: { color: string }) {
  return (
    <meshPhysicalMaterial color={color} roughness={0.32} clearcoat={0.7} clearcoatRoughness={0.25} />
  );
}

interface BodyRefs {
  leftArm: React.RefObject<THREE.Group | null>;
  rightArm: React.RefObject<THREE.Group | null>;
  leftEye: React.RefObject<THREE.Mesh | null>;
  rightEye: React.RefObject<THREE.Mesh | null>;
  mouth: React.RefObject<THREE.Mesh | null>;
  glow: React.RefObject<THREE.Mesh | null>;
}

// 頭髪(トモコレ風)
function HumanHair({ style, color }: { style: HairStyle; color: string }) {
  if (style === "bald") return null;
  return (
    <group>
      {/* ベースの頭髪 */}
      <mesh position={[0, 1.44, -0.02]} scale={[1.06, 1.02, 1.06]} castShadow>
        <sphereGeometry args={[0.3, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {style === "bob" && (
        <>
          <mesh position={[-0.28, 1.28, 0.04]} castShadow>
            <sphereGeometry args={[0.12, 14, 14]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
          <mesh position={[0.28, 1.28, 0.04]} castShadow>
            <sphereGeometry args={[0.12, 14, 14]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        </>
      )}
      {style === "pony" && (
        <mesh position={[0, 1.42, -0.3]} rotation={[0.7, 0, 0]} castShadow>
          <capsuleGeometry args={[0.08, 0.34, 6, 12]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      )}
      {style === "bun" && (
        <mesh position={[0, 1.66, -0.14]} castShadow>
          <sphereGeometry args={[0.13, 16, 16]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      )}
      {style === "spiky" &&
        [-0.14, 0, 0.14].map((x, i) => (
          <mesh key={i} position={[x, 1.66, 0.02]} rotation={[0, 0, i === 0 ? 0.3 : i === 2 ? -0.3 : 0]}>
            <coneGeometry args={[0.07, 0.18, 8]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        ))}
    </group>
  );
}

// 人間ボディ(Mii風)
function HumanBody({ look, refs }: { look: HumanLook; refs: BodyRefs }) {
  return (
    <>
      {/* 脚 */}
      <mesh position={[-0.11, 0.18, 0]} castShadow>
        <capsuleGeometry args={[0.08, 0.24, 6, 12]} />
        <meshStandardMaterial color="#3f4a63" roughness={0.7} />
      </mesh>
      <mesh position={[0.11, 0.18, 0]} castShadow>
        <capsuleGeometry args={[0.08, 0.24, 6, 12]} />
        <meshStandardMaterial color="#3f4a63" roughness={0.7} />
      </mesh>
      {/* 胴体(シャツ) */}
      <mesh position={[0, 0.56, 0]} scale={[1, 1.05, 0.85]} castShadow>
        <capsuleGeometry args={[0.24, 0.36, 8, 16]} />
        <meshStandardMaterial color={look.shirt} roughness={0.55} />
      </mesh>
      {/* 腕 */}
      <group ref={refs.leftArm} position={[-0.3, 0.72, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.28, 6, 12]} />
          <meshStandardMaterial color={look.shirt} roughness={0.55} />
        </mesh>
        <mesh position={[0, -0.36, 0]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color={look.skin} roughness={0.6} />
        </mesh>
      </group>
      <group ref={refs.rightArm} position={[0.3, 0.72, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.28, 6, 12]} />
          <meshStandardMaterial color={look.shirt} roughness={0.55} />
        </mesh>
        <mesh position={[0, -0.36, 0]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color={look.skin} roughness={0.6} />
        </mesh>
      </group>
      {/* 頭(大きめのトモコレ比率) */}
      <group position={[0, 1.14, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.32, 32, 28]} />
          <meshStandardMaterial color={look.skin} roughness={0.55} />
        </mesh>
        <HumanHair style={look.hairStyle} color={look.hairColor} />
        {/* 目 */}
        <mesh ref={refs.leftEye} position={[-0.1, 0.02, 0.3]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color="#20232b" roughness={0.3} />
        </mesh>
        <mesh ref={refs.rightEye} position={[0.1, 0.02, 0.3]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color="#20232b" roughness={0.3} />
        </mesh>
        {/* ほっぺ */}
        {look.blush && (
          <>
            <mesh position={[-0.17, -0.06, 0.27]}>
              <circleGeometry args={[0.045, 16]} />
              <meshStandardMaterial color="#fca5a5" transparent opacity={0.7} />
            </mesh>
            <mesh position={[0.17, -0.06, 0.27]}>
              <circleGeometry args={[0.045, 16]} />
              <meshStandardMaterial color="#fca5a5" transparent opacity={0.7} />
            </mesh>
          </>
        )}
        {/* 口(にっこり) */}
        <mesh ref={refs.mouth} position={[0, -0.11, 0.3]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.05, 0.014, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#b45c4a" roughness={0.5} />
        </mesh>
        {/* メガネ */}
        {look.glasses && (
          <group position={[0, 0.02, 0.31]}>
            <mesh position={[-0.1, 0, 0]}>
              <torusGeometry args={[0.07, 0.012, 8, 20]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
            <mesh position={[0.1, 0, 0]}>
              <torusGeometry args={[0.07, 0.012, 8, 20]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
            <mesh>
              <boxGeometry args={[0.06, 0.012, 0.012]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
          </group>
        )}
      </group>
    </>
  );
}

// ロボットボディ
function RobotBody({ look, refs }: { look: RobotLook; refs: BodyRefs }) {
  return (
    <>
      <mesh ref={refs.glow} position={[0, -0.08, 0]}>
        <coneGeometry args={[0.16, 0.22, 16, 1, true]} />
        <meshStandardMaterial
          color="#7dd3fc"
          emissive="#38bdf8"
          emissiveIntensity={1}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.1, 0]} castShadow>
        <sphereGeometry args={[0.19, 24, 18]} />
        <ToyMaterial color="#3b82f6" />
      </mesh>
      <mesh position={[0, 0.5, 0]} scale={[1, 1.12, 0.92]} castShadow>
        <sphereGeometry args={[0.32, 36, 28]} />
        <ToyMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.44, 0.22]} scale={[1, 1.2, 0.55]}>
        <sphereGeometry args={[0.16, 24, 18]} />
        <ToyMaterial color="#60a5fa" />
      </mesh>
      <Decal style={look.decal} accent={look.accent} />
      <group ref={refs.leftArm} position={[-0.36, 0.62, 0]}>
        <mesh position={[0, -0.14, 0]} castShadow>
          <capsuleGeometry args={[0.06, 0.2, 6, 12]} />
          <ToyMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, -0.3, 0]}>
          <sphereGeometry args={[0.075, 14, 14]} />
          <ToyMaterial color="#3b82f6" />
        </mesh>
      </group>
      <group ref={refs.rightArm} position={[0.36, 0.62, 0]}>
        <mesh position={[0, -0.14, 0]} castShadow>
          <capsuleGeometry args={[0.06, 0.2, 6, 12]} />
          <ToyMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, -0.3, 0]}>
          <sphereGeometry args={[0.075, 14, 14]} />
          <ToyMaterial color="#3b82f6" />
        </mesh>
      </group>
      <group position={[0, 1.18, 0]}>
        <RoundedBox args={[0.66, 0.5, 0.5]} radius={0.16} smoothness={8} castShadow>
          <meshPhysicalMaterial color="#ffffff" roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.2} />
        </RoundedBox>
        <RoundedBox args={[0.5, 0.34, 0.06]} radius={0.1} smoothness={6} position={[0, -0.01, 0.235]}>
          <meshStandardMaterial color="#0b1220" roughness={0.35} />
        </RoundedBox>
        <mesh ref={refs.leftEye} position={[-0.11, 0.03, 0.275]}>
          <capsuleGeometry args={[0.032, 0.05, 6, 12]} />
          <meshStandardMaterial color={look.eyeColor} emissive={look.eyeColor} emissiveIntensity={2} />
        </mesh>
        <mesh ref={refs.rightEye} position={[0.11, 0.03, 0.275]}>
          <capsuleGeometry args={[0.032, 0.05, 6, 12]} />
          <meshStandardMaterial color={look.eyeColor} emissive={look.eyeColor} emissiveIntensity={2} />
        </mesh>
        <mesh ref={refs.mouth} position={[0, -0.07, 0.275]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.055, 0.014, 10, 20, Math.PI]} />
          <meshStandardMaterial color={look.eyeColor} emissive={look.eyeColor} emissiveIntensity={2} />
        </mesh>
        <mesh position={[-0.36, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={look.podSize}>
          <cylinderGeometry args={[0.09, 0.09, 0.08, 18]} />
          <ToyMaterial color={look.accent} />
        </mesh>
        <mesh position={[0.36, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={look.podSize}>
          <cylinderGeometry args={[0.09, 0.09, 0.08, 18]} />
          <ToyMaterial color={look.accent} />
        </mesh>
      </group>
      <Antenna style={look.antenna} accent={look.accent} />
    </>
  );
}

function Character({
  employee,
  target,
  onSelect,
}: {
  employee: Employee;
  target: CharTarget;
  onSelect: (sel: OfficeSelection) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const refs: BodyRefs = { leftArm, rightArm, leftEye, rightEye, mouth, glow };

  // 経路(ウェイポイント)管理
  const route = useRef<THREE.Vector3[]>([]);
  const routeGoal = useRef<string>("");

  const kind = useMemo(() => avatarKindOf(employee), [employee]);
  const robotLook = useMemo(() => robotLookFor(employee), [employee]);
  const humanLook = useMemo(() => humanLookFor(employee), [employee]);
  const heightScale = kind === "robot" ? robotLook.height : humanLook.height;
  const phase = hash(employee.id, 100) / 10;

  // 初期位置:記憶があればそこから、新入社員は入口から歩いてくる
  const initial = useMemo(() => {
    const mem = positionMemory.get(employee.id);
    if (mem) return mem;
    return { x: ENTRANCE[0], z: ENTRANCE[1], ry: Math.PI };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;

    // 目標が変わったらルートを組み直す
    const goalKey = `${target.pos[0].toFixed(1)},${target.pos[2].toFixed(1)}`;
    if (routeGoal.current !== goalKey) {
      routeGoal.current = goalKey;
      route.current = buildRoute(g.position.x, g.position.z, [target.pos[0], target.pos[2]]);
    }

    // 現在のウェイポイントへ歩く
    let moving = false;
    const wp = route.current[0];
    if (wp) {
      const dist = g.position.distanceTo(wp);
      if (dist < 0.12) {
        route.current.shift();
      } else {
        moving = true;
        const dir = wp.clone().sub(g.position).normalize();
        g.position.add(dir.multiplyScalar(Math.min(dist, 1.9 * delta)));
        const targetRot = Math.atan2(dir.x, dir.z);
        let d = targetRot - g.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        g.rotation.y += d * 0.14;
      }
    }
    if (!moving) {
      let d = target.rotY - g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += d * 0.1;
    }

    // 位置を記憶(再マウント時の瞬間移動防止)
    positionMemory.set(employee.id, { x: g.position.x, z: g.position.z, ry: g.rotation.y });

    if (body.current) {
      // ロボットはホバー浮遊、人間は接地して軽く上下(歩行時はバウンド)
      const baseY = kind === "robot" ? 0.42 : 0;
      const bob = kind === "robot"
        ? Math.sin(t * (moving ? 6 : 2) + phase) * (moving ? 0.035 : 0.05)
        : moving
          ? Math.abs(Math.sin(t * 8 + phase)) * 0.05
          : Math.sin(t * 2 + phase) * 0.015;
      body.current.position.y = baseY + bob;
      body.current.rotation.x = THREE.MathUtils.lerp(body.current.rotation.x, moving ? 0.14 : 0, 0.1);
      body.current.rotation.z =
        target.pose === "game" && !moving ? Math.sin(t * 3 + phase) * 0.08 : 0;
    }
    if (glow.current) {
      const mat = glow.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = moving ? 1.7 : 0.8 + Math.sin(t * 4 + phase) * 0.2;
    }

    let armL = 0.25;
    let armR = -0.25;
    if (moving) {
      armL = 0.7;
      armR = -0.7;
    } else if (target.pose === "work") {
      armL = -0.85 + Math.sin(t * 7 + phase) * 0.07;
      armR = -0.85 + Math.cos(t * 6.3 + phase) * 0.07;
    } else if (target.pose === "game") {
      armL = -1.0;
      armR = -1.0;
    } else if (target.pose === "meeting") {
      const gesture = Math.max(0, Math.sin(t * 0.9 + phase * 2));
      armL = -0.25 - gesture * 0.7;
      armR = -0.15 + Math.sin(t * 1.3 + phase) * 0.12;
    }
    if (leftArm.current)
      leftArm.current.rotation.x = THREE.MathUtils.lerp(leftArm.current.rotation.x, armL, 0.15);
    if (rightArm.current)
      rightArm.current.rotation.x = THREE.MathUtils.lerp(rightArm.current.rotation.x, armR, 0.15);

    const blink = Math.sin(t * 0.9 + phase * 3) > 0.985 ? 0.12 : 1;
    const eyeScaleY = target.pose === "game" ? 0.55 : 1;
    if (leftEye.current) leftEye.current.scale.y = blink * eyeScaleY;
    if (rightEye.current) rightEye.current.scale.y = blink * eyeScaleY;
    if (mouth.current) {
      const talk = target.pose === "meeting" ? 1 + Math.abs(Math.sin(t * 6 + phase)) * 0.35 : 1;
      mouth.current.scale.setScalar(talk);
    }
  });

  const bubbleText =
    employee.currentTask && employee.status !== "break"
      ? employee.currentTask.detail
      : employee.statusLabel;

  return (
    <group
      ref={group}
      position={[initial.x, 0, initial.z]}
      rotation={[0, initial.ry, 0]}
      scale={heightScale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: "employee", employeeId: employee.id });
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      <group ref={body}>
        {kind === "robot" ? (
          <RobotBody look={robotLook} refs={refs} />
        ) : (
          <HumanBody look={humanLook} refs={refs} />
        )}
      </group>
      <Html position={[0, 2.15, 0]} center distanceFactor={12} occlude={false} zIndexRange={[10, 0]}>
        <div className="flex flex-col items-center pointer-events-none select-none" style={{ width: "150px" }}>
          <div className="rounded-xl bg-white/95 px-2 py-1 text-[9px] leading-tight text-slate-700 shadow-md ring-1 ring-slate-200/80 text-center max-w-[150px]">
            {bubbleText}
          </div>
          <div
            className="mt-0.5 flex items-center gap-1 rounded-full px-2 py-px text-[9px] font-bold text-white shadow-md"
            style={{ backgroundColor: employee.color }}
          >
            <span>{kind === "robot" ? "🤖" : "🙂"}</span>
            {employee.name}
          </div>
        </div>
      </Html>
    </group>
  );
}

// ================================================================
// 家具(トイ調)
// ================================================================

function hoverCursor(on: boolean) {
  document.body.style.cursor = on ? "pointer" : "auto";
}

function OfficeChair({ position, rotY = 0 }: { position: [number, number, number]; rotY?: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <RoundedBox args={[0.46, 0.09, 0.46]} radius={0.04} smoothness={4} position={[0, 0.44, 0]} castShadow>
        <meshStandardMaterial color={PALETTE.chair} roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[0.44, 0.5, 0.08]} radius={0.04} smoothness={4} position={[0, 0.74, -0.2]} castShadow>
        <meshStandardMaterial color={PALETTE.chair} roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.4, 10]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.24, 0.28, 0.05, 16]} />
        <meshStandardMaterial color={PALETTE.chairDark} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Desk({
  position,
  owner,
  onSelect,
}: {
  position: [number, number, number];
  owner: Employee | null;
  onSelect: (sel: OfficeSelection) => void;
}) {
  const [x, , z] = position;
  return (
    <group
      position={[x, 0, z]}
      onClick={
        owner
          ? (e) => {
              e.stopPropagation();
              onSelect({ kind: "employee", employeeId: owner.id });
            }
          : undefined
      }
      onPointerOver={owner ? () => hoverCursor(true) : undefined}
      onPointerOut={owner ? () => hoverCursor(false) : undefined}
    >
      <RoundedBox args={[1.55, 0.07, 0.78]} radius={0.035} smoothness={4} position={[0, 0.73, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={PALETTE.deskTop} roughness={0.35} />
      </RoundedBox>
      {[
        [-0.7, -0.32],
        [0.7, -0.32],
        [-0.7, 0.32],
        [0.7, 0.32],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.36, lz]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.72, 10]} />
          <meshStandardMaterial color={PALETTE.deskLeg} metalness={0.3} roughness={0.4} />
        </mesh>
      ))}
      <RoundedBox args={[0.62, 0.4, 0.05]} radius={0.03} smoothness={4} position={[0, 1.07, -0.2]} castShadow>
        <meshStandardMaterial color="#1e293b" roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 1.07, -0.172]}>
        <planeGeometry args={[0.55, 0.32]} />
        <meshStandardMaterial
          color={owner ? "#bfdbfe" : "#475569"}
          emissive={owner ? "#60a5fa" : "#0f172a"}
          emissiveIntensity={owner ? 0.8 : 0.1}
        />
      </mesh>
      <mesh position={[0, 0.82, -0.2]}>
        <boxGeometry args={[0.07, 0.12, 0.07]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <RoundedBox args={[0.4, 0.03, 0.14]} radius={0.012} smoothness={4} position={[-0.05, 0.77, 0.1]}>
        <meshStandardMaterial color="#eef2f7" roughness={0.5} />
      </RoundedBox>
      <mesh position={[-0.55, 0.82, -0.1]}>
        <cylinderGeometry args={[0.05, 0.04, 0.11, 16]} />
        <meshStandardMaterial color={owner?.color ?? "#cbd5e1"} roughness={0.4} />
      </mesh>
      {owner && (
        <Html position={[0.62, 0.98, 0.1]} center distanceFactor={8} zIndexRange={[6, 0]}>
          <div
            className="pointer-events-none select-none whitespace-nowrap rounded-md px-1.5 py-px text-[8px] font-bold text-white shadow-md"
            style={{ backgroundColor: owner.color }}
          >
            {owner.name}
          </div>
        </Html>
      )}
      <OfficeChair position={[0, 0, 0.72]} rotY={Math.PI} />
    </group>
  );
}

function PendantLight({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 2.2, 8]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0, -0.05, 0]}>
        <coneGeometry args={[0.34, 0.3, 24, 1, true]} />
        <meshStandardMaterial color="#f8fafc" side={THREE.DoubleSide} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fbbf24" emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

function Whiteboard({
  deptId,
  onSelect,
}: {
  deptId: DepartmentId;
  onSelect: (sel: OfficeSelection) => void;
}) {
  const dept = DEPARTMENTS[deptId];
  const [cx] = DEPT_CENTERS[deptId];
  return (
    <group
      position={[cx, 0, -9.9]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: "whiteboard", department: deptId });
      }}
      onPointerOver={() => hoverCursor(true)}
      onPointerOut={() => hoverCursor(false)}
    >
      <RoundedBox args={[2.72, 1.52, 0.06]} radius={0.05} smoothness={4} position={[0, 1.55, -0.01]} castShadow>
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 1.55, 0.025]}>
        <planeGeometry args={[2.55, 1.36]} />
        <meshStandardMaterial color="#ffffff" roughness={0.25} />
      </mesh>
      <mesh position={[-0.6, 1.95, 0.035]}>
        <planeGeometry args={[1.0, 0.07]} />
        <meshStandardMaterial color={dept.color} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.3 + i * 0.1, 1.68 - i * 0.2, 0.035]}>
          <planeGeometry args={[1.6 - i * 0.3, 0.04]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      ))}
      <mesh position={[0.85, 1.35, 0.035]}>
        <circleGeometry args={[0.15, 24]} />
        <meshStandardMaterial color="#fb7185" />
      </mesh>
      <RoundedBox args={[1.2, 0.05, 0.12]} radius={0.02} smoothness={4} position={[0, 0.82, 0.06]}>
        <meshStandardMaterial color="#cbd5e1" />
      </RoundedBox>
      <Html position={[0, 2.55, 0.1]} center distanceFactor={13} zIndexRange={[5, 0]}>
        <button
          className="pointer-events-auto select-none whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold text-white shadow-lg hover:scale-110 transition"
          style={{ backgroundColor: dept.color }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ kind: "whiteboard", department: deptId });
          }}
        >
          📋 {dept.name}の目標・進捗
        </button>
      </Html>
    </group>
  );
}

function SharedCabinet({
  position,
  onSelect,
}: {
  position: [number, number, number];
  onSelect: (sel: OfficeSelection) => void;
}) {
  return (
    <group
      position={position}
      rotation={[0, Math.PI / 2, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: "shelf" });
      }}
      onPointerOver={() => hoverCursor(true)}
      onPointerOut={() => hoverCursor(false)}
    >
      <RoundedBox args={[1.8, 1.9, 0.42]} radius={0.06} smoothness={4} position={[0, 0.95, 0]} castShadow>
        <meshStandardMaterial color="#faf5ee" roughness={0.4} />
      </RoundedBox>
      {[0.42, 0.95, 1.48].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0.03]}>
            <boxGeometry args={[1.7, 0.04, 0.38]} />
            <meshStandardMaterial color="#e0d5c5" />
          </mesh>
          {[-0.55, -0.15, 0.25, 0.6].map((x, i) => (
            <RoundedBox key={i} args={[0.16, 0.3, 0.24]} radius={0.02} smoothness={2} position={[x, y + 0.17, 0.08]}>
              <meshStandardMaterial
                color={["#7dc4e8", "#fbbf77", "#8fd6c7", "#c4b5fd", "#fda4af"][(i + Math.round(y * 2)) % 5]}
                roughness={0.5}
              />
            </RoundedBox>
          ))}
        </group>
      ))}
      <Html position={[0, 2.35, 0]} center distanceFactor={13} zIndexRange={[5, 0]}>
        <button
          className="pointer-events-auto select-none whitespace-nowrap rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg hover:scale-110 transition"
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ kind: "shelf" });
          }}
        >
          🗄️ 共有キャビネット
        </button>
      </Html>
    </group>
  );
}

function GlassMeetingRoom({
  inMeeting,
  onSelect,
}: {
  inMeeting: boolean;
  onSelect: (sel: OfficeSelection) => void;
}) {
  const [cx, cz] = MEETING_CENTER;
  const W = 7.2;
  const D = MEETING_D;
  const H = 2.5;
  const DOOR_W = 1.7;
  const glassMat = (
    <meshPhysicalMaterial
      color="#cfe8ff"
      transparent
      opacity={0.14}
      roughness={0.04}
      metalness={0}
      side={THREE.DoubleSide}
    />
  );
  const sideW = (W - DOOR_W) / 2;
  return (
    <group>
      <mesh position={[cx, 0.012, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={PALETTE.meetingFloor} roughness={0.7} />
      </mesh>
      {/* 北側(通路側)はドア開口つき */}
      <mesh position={[cx - DOOR_W / 2 - sideW / 2, H / 2, cz - D / 2]}>
        <planeGeometry args={[sideW, H]} />
        {glassMat}
      </mesh>
      <mesh position={[cx + DOOR_W / 2 + sideW / 2, H / 2, cz - D / 2]}>
        <planeGeometry args={[sideW, H]} />
        {glassMat}
      </mesh>
      {/* ドア枠 */}
      {[-DOOR_W / 2, DOOR_W / 2].map((dx, i) => (
        <mesh key={i} position={[cx + dx, H / 2, cz - D / 2]}>
          <boxGeometry args={[0.07, H, 0.07]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
      <mesh position={[cx - W / 2, H / 2, cz]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[D, H]} />
        {glassMat}
      </mesh>
      <mesh position={[cx + W / 2, H / 2, cz]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[D, H]} />
        {glassMat}
      </mesh>
      <mesh position={[cx, H / 2, cz + D / 2]}>
        <planeGeometry args={[W, H]} />
        {glassMat}
      </mesh>
      {[
        [cx - W / 2, cz - D / 2],
        [cx + W / 2, cz - D / 2],
        [cx - W / 2, cz + D / 2],
        [cx + W / 2, cz + D / 2],
      ].map(([fx, fz], i) => (
        <mesh key={i} position={[fx, H / 2, fz]} castShadow>
          <boxGeometry args={[0.08, H, 0.08]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
      {[
        { p: [cx, H, cz - D / 2] as [number, number, number], s: [W, 0.08, 0.08] as [number, number, number] },
        { p: [cx, H, cz + D / 2] as [number, number, number], s: [W, 0.08, 0.08] as [number, number, number] },
        { p: [cx - W / 2, H, cz] as [number, number, number], s: [0.08, 0.08, D] as [number, number, number] },
        { p: [cx + W / 2, H, cz] as [number, number, number], s: [0.08, 0.08, D] as [number, number, number] },
      ].map((f, i) => (
        <mesh key={i} position={f.p}>
          <boxGeometry args={f.s} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
      <mesh position={[cx, 0.74, cz]} castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 1.6, 0.08, 48]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[cx, 0.37, cz]} castShadow>
        <cylinderGeometry args={[0.1, 0.32, 0.74, 20]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.3} roughness={0.4} />
      </mesh>
      {MEETING_SEATS.map((s, i) => (
        <OfficeChair key={i} position={[s.pos[0], 0, s.pos[1]]} rotY={s.rot} />
      ))}
      <group
        position={[cx, 0, cz + D / 2 - 0.25]}
        rotation={[0, Math.PI, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ kind: "meeting" });
        }}
        onPointerOver={() => hoverCursor(true)}
        onPointerOut={() => hoverCursor(false)}
      >
        <RoundedBox args={[2.2, 1.25, 0.08]} radius={0.05} smoothness={4} position={[0, 1.5, 0]} castShadow>
          <meshStandardMaterial color="#1e293b" roughness={0.4} />
        </RoundedBox>
        <mesh position={[0, 1.5, 0.045]}>
          <planeGeometry args={[2.05, 1.1]} />
          <meshStandardMaterial
            color={inMeeting ? "#86efac" : "#334155"}
            emissive={inMeeting ? "#22c55e" : "#0f172a"}
            emissiveIntensity={inMeeting ? 0.5 : 0.1}
          />
        </mesh>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.1, 0.8, 0.1]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      </group>
      <PendantLight position={[cx, 3.1, cz]} />
      <Html position={[cx, 3.0, cz]} center distanceFactor={14} zIndexRange={[5, 0]}>
        <button
          className={`pointer-events-auto select-none whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold shadow-lg hover:scale-110 transition ${
            inMeeting ? "bg-amber-400 text-white animate-pulse" : "bg-white/95 text-amber-600"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ kind: "meeting" });
          }}
        >
          🤝 会議室{inMeeting ? " MTG中" : "(議事録)"}
        </button>
      </Html>
    </group>
  );
}

function Lounge() {
  const [cx, cz] = LOUNGE_CENTER;
  return (
    <group>
      <mesh position={[cx, 0.012, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3.4, 48]} />
        <meshStandardMaterial color={PALETTE.loungeRug} roughness={0.8} />
      </mesh>
      <group position={[cx, 0, SOFA_Z + 0.15]}>
        <RoundedBox args={[3.0, 0.46, 1.05]} radius={0.12} smoothness={4} position={[0, 0.32, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={PALETTE.sofa} roughness={0.6} />
        </RoundedBox>
        <RoundedBox args={[3.0, 0.66, 0.24]} radius={0.1} smoothness={4} position={[0, 0.74, 0.45]} castShadow>
          <meshStandardMaterial color={PALETTE.sofaDark} roughness={0.6} />
        </RoundedBox>
        {[-1.42, 1.42].map((ax) => (
          <RoundedBox key={ax} args={[0.24, 0.54, 1.05]} radius={0.1} smoothness={4} position={[ax, 0.54, 0]} castShadow>
            <meshStandardMaterial color={PALETTE.sofaDark} roughness={0.6} />
          </RoundedBox>
        ))}
        <RoundedBox args={[0.4, 0.4, 0.14]} radius={0.06} smoothness={4} position={[-0.9, 0.64, 0.3]} rotation={[0.3, 0, 0.1]}>
          <meshStandardMaterial color="#fcd34d" roughness={0.7} />
        </RoundedBox>
        <RoundedBox args={[0.4, 0.4, 0.14]} radius={0.06} smoothness={4} position={[1.0, 0.64, 0.3]} rotation={[0.3, 0, -0.15]}>
          <meshStandardMaterial color="#f9a8d4" roughness={0.7} />
        </RoundedBox>
      </group>
      {[
        [LOUNGE_CENTER[0] - 2.3, LOUNGE_CENTER[1] + 0.4],
        [LOUNGE_CENTER[0] + 2.4, LOUNGE_CENTER[1] + 0.4],
      ].map(([bx, bz], i) => (
        <mesh key={i} position={[bx, 0.24, bz]} scale={[1, 0.75, 1]} castShadow>
          <sphereGeometry args={[0.45, 24, 18]} />
          <meshStandardMaterial color={i === 0 ? "#fbbf77" : "#c4b5fd"} roughness={0.8} />
        </mesh>
      ))}
      <group position={[cx, 0, cz + 0.6]}>
        <mesh position={[0, 0.36, 0]} castShadow>
          <cylinderGeometry args={[0.55, 0.55, 0.06, 32]} />
          <meshStandardMaterial color="#f5e0c3" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.36, 10]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.3} />
        </mesh>
      </group>
      <group position={[cx, 0, cz - 2.5]}>
        <RoundedBox args={[2.0, 0.64, 0.42]} radius={0.06} smoothness={4} position={[0, 0.32, 0]} castShadow>
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </RoundedBox>
        <mesh position={[-0.6, 0.7, 0.05]}>
          <boxGeometry args={[0.3, 0.08, 0.22]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
        <RoundedBox args={[1.9, 1.08, 0.08]} radius={0.05} smoothness={4} position={[0, 1.36, 0]} castShadow>
          <meshStandardMaterial color="#1e293b" roughness={0.4} />
        </RoundedBox>
        <mesh position={[0, 1.36, 0.045]}>
          <planeGeometry args={[1.76, 0.94]} />
          <meshStandardMaterial color="#c4b5fd" emissive="#8b5cf6" emissiveIntensity={0.9} />
        </mesh>
      </group>
      <Html position={[cx, 2.9, cz]} center distanceFactor={14} zIndexRange={[5, 0]}>
        <div className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-sky-600 shadow-lg pointer-events-none select-none whitespace-nowrap">
          🎮 ラウンジ
        </div>
      </Html>
    </group>
  );
}

function CoffeeBar() {
  const [cx, cz] = KITCHEN_CENTER;
  return (
    <group position={[cx, 0, cz]}>
      <RoundedBox args={[4.2, 1.0, 0.8]} radius={0.08} smoothness={4} position={[0, 0.5, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={PALETTE.counter} roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[4.4, 0.07, 0.95]} radius={0.03} smoothness={4} position={[0, 1.03, 0]} castShadow>
        <meshStandardMaterial color={PALETTE.counterTop} roughness={0.3} />
      </RoundedBox>
      <RoundedBox args={[0.5, 0.4, 0.4]} radius={0.06} smoothness={4} position={[-1.2, 1.27, 0]} castShadow>
        <meshPhysicalMaterial color="#f87171" roughness={0.3} clearcoat={0.6} />
      </RoundedBox>
      {[-0.4, -0.1, 0.2].map((x, i) => (
        <mesh key={i} position={[x, 1.12, 0.1]}>
          <cylinderGeometry args={[0.045, 0.038, 0.09, 14]} />
          <meshStandardMaterial color={["#fcd34d", "#7dc4e8", "#ffffff"][i]} roughness={0.4} />
        </mesh>
      ))}
      {[-0.8, 0.8].map((x) => (
        <group key={x} position={[x, 0, 1.0]}>
          <mesh position={[0, 0.63, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.07, 20]} />
            <meshStandardMaterial color="#fbbf77" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.03, 0.05, 0.6, 10]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Plant({ position, big = false }: { position: [number, number, number]; big?: boolean }) {
  const s = big ? 1.5 : 1;
  return (
    <group position={position} scale={s}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.27, 0.44, 20]} />
        <meshStandardMaterial color="#fde8d7" roughness={0.6} />
      </mesh>
      {[0, 1.2, 2.4, 3.6, 4.8].map((a, i) => (
        <mesh
          key={i}
          position={[Math.cos(a) * 0.2, 0.75 + (i % 2) * 0.25, Math.sin(a) * 0.2]}
          rotation={[0.5, a, 0]}
          castShadow
        >
          <sphereGeometry args={[0.24, 14, 10]} />
          <meshStandardMaterial color={i % 2 ? "#4ade80" : "#34d399"} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function OfficeRoom() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[32, 21]} />
        <meshStandardMaterial color={PALETTE.floor} roughness={0.75} />
      </mesh>
      {Array.from({ length: 15 }, (_, i) => (
        <mesh key={i} position={[-14 + i * 2, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.03, 21]} />
          <meshStandardMaterial color={PALETTE.floorLine} transparent opacity={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 1.7, -10.4]} receiveShadow>
        <boxGeometry args={[32, 3.4, 0.3]} />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.7} />
      </mesh>
      <mesh position={[-15.8, 1.7, 0]} receiveShadow>
        <boxGeometry args={[0.3, 3.4, 21]} />
        <meshStandardMaterial color={PALETTE.accentWall} roughness={0.7} />
      </mesh>
      {[-13, -4.5, 2, 13].map((x) => (
        <group key={x}>
          <RoundedBox args={[3.4, 2.0, 0.08]} radius={0.06} smoothness={4} position={[x, 1.9, -10.22]}>
            <meshStandardMaterial color="#d6ecff" emissive="#bfdbfe" emissiveIntensity={0.35} />
          </RoundedBox>
          {[0, 1, 2].map((b) => (
            <mesh key={b} position={[x - 1.0 + b * 1.0, 1.5 + (b % 2) * 0.3, -10.17]}>
              <planeGeometry args={[0.5, 0.9 + (b % 2) * 0.5]} />
              <meshStandardMaterial color="#93b8d8" transparent opacity={0.5} />
            </mesh>
          ))}
        </group>
      ))}
      <Html position={[6, 2.85, -10.2]} center distanceFactor={16} zIndexRange={[4, 0]}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded-2xl bg-slate-800/90 px-4 py-1.5 text-[14px] font-black tracking-wide text-white shadow-xl">
          AIbou <span className="text-amber-300">Office</span>
        </div>
      </Html>
      <Plant position={[-14.6, 0, -9.2]} big />
      <Plant position={[14.2, 0, -9.2]} big />
      <Plant position={[14.4, 0, 8.5]} big />
      <Plant position={[-3.4, 0, 8.6]} />
      <Plant position={[7.8, 0, 8.9]} />
      {/* 中央通路のラグ */}
      <mesh position={[0, 0.008, CORRIDOR_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[26, 2.6]} />
        <meshStandardMaterial color={PALETTE.rugCorridor} roughness={0.85} />
      </mesh>
      {/* 入口マット */}
      <mesh position={[ENTRANCE[0], 0.01, ENTRANCE[1] - 0.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.4, 1.4]} />
        <meshStandardMaterial color="#a8d8c8" roughness={0.9} />
      </mesh>
      <Html position={[ENTRANCE[0], 1.6, ENTRANCE[1] + 0.4]} center distanceFactor={14} zIndexRange={[4, 0]}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded-full bg-white/90 px-2.5 py-0.5 text-[9px] font-bold text-emerald-600 shadow">
          🚪 エントランス
        </div>
      </Html>
    </group>
  );
}

// ================================================================
// シーン本体
// ================================================================

function OfficeScene({
  onSelect,
  employees,
  controlsRef,
}: {
  onSelect: (sel: OfficeSelection) => void;
  employees: Employee[];
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const meetings = useCompanyStore((s) => s.meetings);
  const divisionId = employees[0]?.divisionId;
  const currentMeeting = meetings.find(
    (m) => m.status === "in_progress" && m.divisionId === divisionId
  );
  const participantIds = useMemo(
    () => currentMeeting?.participantIds ?? [],
    [currentMeeting]
  );

  const targets = useMemo(
    () => computeTargets(employees, participantIds),
    [employees, participantIds]
  );

  const deskAssignments = useMemo(() => {
    const list: { pos: [number, number, number]; owner: Employee | null }[] = [];
    (Object.keys(DEPT_CENTERS) as DepartmentId[]).forEach((dept) => {
      const members = employees.filter((e) => e.department === dept);
      const [cx, cz] = DEPT_CENTERS[dept];
      DESK_SLOTS.forEach((slot, i) => {
        list.push({
          pos: [cx + slot[0], 0, cz + slot[1]],
          owner: members[i] ?? null,
        });
      });
    });
    return list;
  }, [employees]);

  return (
    <>
      <SoftShadows size={22} samples={14} focus={0.9} />
      <ambientLight intensity={0.68} color="#fff8f0" />
      <directionalLight
        position={[10, 18, 12]}
        intensity={1.6}
        color="#fff4e0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0003}
      />
      <directionalLight position={[-12, 10, -6]} intensity={0.35} color="#dbeafe" />
      <hemisphereLight args={["#e8f4ff", PALETTE.floor, 0.45]} />

      <OfficeRoom />
      {(Object.keys(DEPT_CENTERS) as DepartmentId[]).map((dept) => {
        const d = DEPARTMENTS[dept];
        const [cx, cz] = DEPT_CENTERS[dept];
        return (
          <group key={dept}>
            <mesh position={[cx, 0.012, cz + 1.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[6.4, 6]} />
              <meshStandardMaterial color={d.color} transparent opacity={0.1} />
            </mesh>
            <PendantLight position={[cx, 3.1, cz + 1.4]} />
            <Whiteboard deptId={dept} onSelect={onSelect} />
            <Html position={[cx, 3.0, cz - 1.6]} center distanceFactor={14} zIndexRange={[5, 0]}>
              <div
                className="rounded-full px-3 py-1 text-[11px] font-bold text-white shadow-lg pointer-events-none select-none whitespace-nowrap"
                style={{ backgroundColor: d.color }}
              >
                {d.name}
              </div>
            </Html>
          </group>
        );
      })}
      {deskAssignments.map((d, i) => (
        <Desk key={i} position={d.pos} owner={d.owner} onSelect={onSelect} />
      ))}
      <GlassMeetingRoom inMeeting={!!currentMeeting} onSelect={onSelect} />
      <Lounge />
      <CoffeeBar />
      <SharedCabinet position={[-15.2, 0, 0.2]} onSelect={onSelect} />

      {employees.map((e) => {
        const t = targets.get(e.id);
        if (!t) return null;
        return <Character key={e.id} employee={e} target={t} onSelect={onSelect} />;
      })}

      <OrbitControls
        ref={controlsRef}
        target={[0, 0.6, 1]}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={4}
        maxDistance={30}
        enableDamping
        dampingFactor={0.1}
        zoomSpeed={0.9}
      />
    </>
  );
}

const DEFAULT_CAM: [number, number, number] = [1, 11, 15];
const DEFAULT_TARGET: [number, number, number] = [0, 0.6, 1];

export default function Office3D({
  onSelect,
  employees,
}: {
  onSelect: (sel: OfficeSelection) => void;
  employees: Employee[];
}) {
  const controls = useRef<OrbitControlsImpl>(null);

  const zoom = (factor: number) => {
    const c = controls.current;
    if (!c) return;
    const cam = c.object;
    const dir = cam.position.clone().sub(c.target);
    const nextLen = THREE.MathUtils.clamp(dir.length() * factor, c.minDistance, c.maxDistance);
    cam.position.copy(c.target.clone().add(dir.setLength(nextLen)));
    c.update();
  };
  const resetView = () => {
    const c = controls.current;
    if (!c) return;
    c.object.position.set(...DEFAULT_CAM);
    c.target.set(...DEFAULT_TARGET);
    c.update();
  };

  return (
    <div className="relative h-[clamp(340px,56vh,560px)] w-full overflow-hidden rounded-3xl ring-1 ring-white/30 shadow-lg bg-gradient-to-b from-sky-100 to-orange-50">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: DEFAULT_CAM, fov: 45 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.12;
        }}
      >
        <OfficeScene onSelect={onSelect} employees={employees} controlsRef={controls} />
      </Canvas>

      {/* カメラ操作ボタン */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button
          onClick={() => zoom(0.8)}
          className="h-8 w-8 rounded-full bg-white/95 text-slate-700 text-base font-bold shadow ring-1 ring-slate-200 hover:bg-white transition"
          title="拡大"
        >
          ＋
        </button>
        <button
          onClick={() => zoom(1.25)}
          className="h-8 w-8 rounded-full bg-white/95 text-slate-700 text-base font-bold shadow ring-1 ring-slate-200 hover:bg-white transition"
          title="縮小"
        >
          －
        </button>
        <button
          onClick={resetView}
          className="h-8 w-8 rounded-full bg-white/95 text-sm shadow ring-1 ring-slate-200 hover:bg-white transition"
          title="視点をリセット"
        >
          🎯
        </button>
      </div>

      <div className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 text-[10px] text-slate-500 shadow pointer-events-none">
        💡 社員・デスク・ホワイトボード・キャビネット・会議室をクリックで詳細 ・ ドラッグで回転 ・ ホイールで拡大
      </div>
    </div>
  );
}

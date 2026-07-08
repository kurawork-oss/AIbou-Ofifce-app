"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, PointerLockControls, RoundedBox } from "@react-three/drei";
import type { PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useCompanyStore } from "@/lib/store";
import { DEPARTMENTS } from "@/lib/data";
import type { DepartmentId, Employee, OfficeSelection } from "@/lib/types";

// ================================================================
// レイアウト定義(床: 32 x 21)
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
const MEETING_W = 7.2;
const MEETING_D = 5.6;

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
  accent: string; // 耳ポッド・デカールの色(部署/個人カラー)
  eyeColor: string;
  height: number;
  podSize: number;
}

const EYE_COLORS = ["#7dd3fc", "#a5f3fc", "#86efac", "#fde68a", "#f0abfc", "#93c5fd"];
const ANTENNAS: AntennaStyle[] = ["single", "double", "loop", "cap"];
const DECALS: DecalStyle[] = ["circle", "star", "bolt", "none"];

// 初期メンバーは見た目を固定して個性を出す
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

// ================================================================
// 目標位置
// ================================================================

interface CharTarget {
  pos: [number, number, number];
  rotY: number;
  pose: "work" | "meeting" | "game" | "idle";
}

// 部署内の並び順で「自分のデスク」を固定する
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

// ================================================================
// ロボット社員
// ================================================================

function Antenna({ style, accent }: { style: AntennaStyle; accent: string }) {
  if (style === "single") {
    return (
      <group position={[0, 1.62, 0]}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.24, 6]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
        <mesh position={[0, 0.27, 0]}>
          <sphereGeometry args={[0.045, 10, 10]} />
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
              <cylinderGeometry args={[0.012, 0.012, 0.18, 6]} />
              <meshStandardMaterial color="#e2e8f0" />
            </mesh>
            <mesh position={[0, 0.2, 0]}>
              <sphereGeometry args={[0.035, 8, 8]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  if (style === "loop") {
    return (
      <mesh position={[0, 1.72, 0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.09, 0.018, 8, 16]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} />
      </mesh>
    );
  }
  // cap
  return (
    <mesh position={[0, 1.63, 0]}>
      <cylinderGeometry args={[0.09, 0.11, 0.06, 12]} />
      <meshStandardMaterial color={accent} />
    </mesh>
  );
}

function Decal({ style, accent }: { style: DecalStyle; accent: string }) {
  if (style === "none") return null;
  if (style === "circle") {
    return (
      <mesh position={[0, 0.58, 0.285]} rotation={[Math.PI / 2 - 0.25, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.01, 16]} />
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
  // bolt
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

function RobotCharacter({
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

  const look = useMemo(() => robotLookFor(employee), [employee]);
  const phase = hash(employee.id, 100) / 10;

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const targetV = new THREE.Vector3(target.pos[0], 0, target.pos[2]);
    const dist = g.position.distanceTo(targetV);
    const moving = dist > 0.1;

    if (moving) {
      const dir = targetV.clone().sub(g.position).normalize();
      g.position.add(dir.multiplyScalar(Math.min(dist, 2.6 * delta)));
      const targetRot = Math.atan2(dir.x, dir.z);
      let d = targetRot - g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += d * 0.18;
    } else {
      let d = target.rotY - g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += d * 0.12;
    }

    if (body.current) {
      // ホバー浮遊+移動時は前傾
      body.current.position.y = 0.42 + Math.sin(t * (moving ? 6 : 2) + phase) * (moving ? 0.03 : 0.05);
      body.current.rotation.x = THREE.MathUtils.lerp(body.current.rotation.x, moving ? 0.18 : 0, 0.1);
      // ゲーム中は左右に揺れる
      body.current.rotation.z = target.pose === "game" && !moving ? Math.sin(t * 3 + phase) * 0.08 : 0;
    }
    if (glow.current) {
      const mat = glow.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = moving ? 1.6 : 0.8 + Math.sin(t * 4 + phase) * 0.2;
    }

    // 腕のポーズ
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
    if (leftArm.current) leftArm.current.rotation.x = THREE.MathUtils.lerp(leftArm.current.rotation.x, armL, 0.15);
    if (rightArm.current) rightArm.current.rotation.x = THREE.MathUtils.lerp(rightArm.current.rotation.x, armR, 0.15);

    // 表情:まばたき+ポーズ別の目
    const blink = Math.sin(t * 0.9 + phase * 3) > 0.985 ? 0.12 : 1;
    const eyeScaleY = target.pose === "game" ? 0.55 : 1; // ゲーム中はにっこり目
    if (leftEye.current) leftEye.current.scale.y = blink * eyeScaleY;
    if (rightEye.current) rightEye.current.scale.y = blink * eyeScaleY;
    // MTG中は口がパクパク(発言)
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
      position={[target.pos[0], 0, target.pos[2]]}
      scale={look.height}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: "employee", employeeId: employee.id });
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      <group ref={body}>
        {/* ホバー推進器の光 */}
        <mesh ref={glow} position={[0, -0.08, 0]}>
          <coneGeometry args={[0.16, 0.22, 12, 1, true]} />
          <meshStandardMaterial
            color="#7dd3fc"
            emissive="#38bdf8"
            emissiveIntensity={1}
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* 下部(腰)ユニット */}
        <mesh position={[0, 0.1, 0]} castShadow>
          <sphereGeometry args={[0.19, 16, 12]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.35} />
        </mesh>
        {/* 胴体(白いたまご型) */}
        <mesh position={[0, 0.5, 0]} scale={[1, 1.12, 0.92]} castShadow>
          <sphereGeometry args={[0.32, 24, 20]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.25} />
        </mesh>
        {/* おなかのブルーパネル */}
        <mesh position={[0, 0.44, 0.22]} scale={[1, 1.2, 0.55]}>
          <sphereGeometry args={[0.16, 16, 12]} />
          <meshStandardMaterial color="#2563eb" roughness={0.3} />
        </mesh>
        <Decal style={look.decal} accent={look.accent} />
        {/* 腕(肩を支点に) */}
        <group ref={leftArm} position={[-0.36, 0.62, 0]}>
          <mesh position={[0, -0.14, 0]} castShadow>
            <capsuleGeometry args={[0.06, 0.2, 4, 8]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.3, 0]}>
            <sphereGeometry args={[0.075, 10, 10]} />
            <meshStandardMaterial color="#2563eb" />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.36, 0.62, 0]}>
          <mesh position={[0, -0.14, 0]} castShadow>
            <capsuleGeometry args={[0.06, 0.2, 4, 8]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.3, 0]}>
            <sphereGeometry args={[0.075, 10, 10]} />
            <meshStandardMaterial color="#2563eb" />
          </mesh>
        </group>
        {/* 頭(白い丸角ボックス) */}
        <group position={[0, 1.18, 0]}>
          <RoundedBox args={[0.66, 0.5, 0.5]} radius={0.16} smoothness={6} castShadow>
            <meshStandardMaterial color="#f8fafc" roughness={0.25} />
          </RoundedBox>
          {/* 顔スクリーン(黒) */}
          <RoundedBox args={[0.5, 0.34, 0.06]} radius={0.1} smoothness={4} position={[0, -0.01, 0.235]}>
            <meshStandardMaterial color="#0b1220" roughness={0.4} />
          </RoundedBox>
          {/* 目(発光) */}
          <mesh ref={leftEye} position={[-0.11, 0.03, 0.275]}>
            <capsuleGeometry args={[0.032, 0.05, 4, 8]} />
            <meshStandardMaterial color={look.eyeColor} emissive={look.eyeColor} emissiveIntensity={2} />
          </mesh>
          <mesh ref={rightEye} position={[0.11, 0.03, 0.275]}>
            <capsuleGeometry args={[0.032, 0.05, 4, 8]} />
            <meshStandardMaterial color={look.eyeColor} emissive={look.eyeColor} emissiveIntensity={2} />
          </mesh>
          {/* 口(にっこりアーク・発光) */}
          <mesh ref={mouth} position={[0, -0.07, 0.275]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.055, 0.014, 8, 16, Math.PI]} />
            <meshStandardMaterial color={look.eyeColor} emissive={look.eyeColor} emissiveIntensity={2} />
          </mesh>
          {/* 耳ポッド */}
          <mesh position={[-0.36, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={look.podSize}>
            <cylinderGeometry args={[0.09, 0.09, 0.08, 12]} />
            <meshStandardMaterial color={look.accent} roughness={0.3} />
          </mesh>
          <mesh position={[0.36, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={look.podSize}>
            <cylinderGeometry args={[0.09, 0.09, 0.08, 12]} />
            <meshStandardMaterial color={look.accent} roughness={0.3} />
          </mesh>
        </group>
        <Antenna style={look.antenna} accent={look.accent} />
      </group>
      {/* 名前+吹き出し */}
      <Html position={[0, 2.15, 0]} center distanceFactor={12} occlude={false} zIndexRange={[10, 0]}>
        <div className="flex flex-col items-center pointer-events-none select-none" style={{ width: "150px" }}>
          <div className="rounded-md bg-white/95 px-1.5 py-0.5 text-[9px] leading-tight text-slate-700 shadow ring-1 ring-slate-200 text-center max-w-[150px]">
            {bubbleText}
          </div>
          <div
            className="mt-0.5 rounded-full px-1.5 py-px text-[9px] font-bold text-white shadow"
            style={{ backgroundColor: employee.color }}
          >
            🤖 {employee.name}
          </div>
        </div>
      </Html>
    </group>
  );
}

// ================================================================
// 家具(クリック対応)
// ================================================================

function hoverCursor(on: boolean) {
  document.body.style.cursor = on ? "pointer" : "auto";
}

function OfficeChair({ position, rotY = 0 }: { position: [number, number, number]; rotY?: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.44, 0]} castShadow>
        <boxGeometry args={[0.46, 0.07, 0.46]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, 0.72, -0.2]} castShadow>
        <boxGeometry args={[0.44, 0.5, 0.06]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.24, 0.28, 0.05, 12]} />
        <meshStandardMaterial color="#475569" />
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
      <mesh position={[0, 0.73, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.55, 0.05, 0.78]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {[
        [-0.7, -0.32],
        [0.7, -0.32],
        [-0.7, 0.32],
        [0.7, 0.32],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.36, lz]} castShadow>
          <boxGeometry args={[0.05, 0.72, 0.05]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}
      {/* モニター */}
      <mesh position={[0, 1.06, -0.2]} castShadow>
        <boxGeometry args={[0.62, 0.38, 0.04]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0, 1.06, -0.177]}>
        <boxGeometry args={[0.56, 0.32, 0.005]} />
        <meshStandardMaterial
          color={owner ? "#93c5fd" : "#334155"}
          emissive={owner ? "#3b82f6" : "#0f172a"}
          emissiveIntensity={owner ? 0.7 : 0.1}
        />
      </mesh>
      <mesh position={[0, 0.81, -0.2]}>
        <boxGeometry args={[0.07, 0.12, 0.07]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[-0.05, 0.77, 0.1]}>
        <boxGeometry args={[0.4, 0.02, 0.14]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[-0.55, 0.81, -0.1]}>
        <cylinderGeometry args={[0.05, 0.04, 0.11, 12]} />
        <meshStandardMaterial color={owner?.color ?? "#94a3b8"} />
      </mesh>
      {/* ネームプレート */}
      {owner && (
        <Html position={[0.62, 0.95, 0.1]} center distanceFactor={8} zIndexRange={[6, 0]}>
          <div
            className="pointer-events-none select-none whitespace-nowrap rounded px-1 py-px text-[8px] font-bold text-white shadow"
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
        <cylinderGeometry args={[0.012, 0.012, 2.2, 6]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0, -0.05, 0]}>
        <coneGeometry args={[0.34, 0.3, 20, 1, true]} />
        <meshStandardMaterial color="#111827" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fbbf24" emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

// 部署ホワイトボード(クリックで目標・進捗パネル)
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
      {/* ボード */}
      <mesh position={[0, 1.55, 0]} castShadow>
        <boxGeometry args={[2.6, 1.4, 0.06]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 1.55, -0.01]}>
        <boxGeometry args={[2.72, 1.52, 0.04]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      {/* ボード上の「書き込み」 */}
      <mesh position={[-0.6, 1.85, 0.035]}>
        <boxGeometry args={[1.0, 0.06, 0.005]} />
        <meshStandardMaterial color={dept.color} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.3 + i * 0.1, 1.6 - i * 0.18, 0.035]}>
          <boxGeometry args={[1.6 - i * 0.3, 0.035, 0.005]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      ))}
      <mesh position={[0.85, 1.3, 0.035]}>
        <cylinderGeometry args={[0.14, 0.14, 0.005, 20]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      {/* ペントレー */}
      <mesh position={[0, 0.82, 0.06]}>
        <boxGeometry args={[1.2, 0.04, 0.12]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <Html position={[0, 2.5, 0.1]} center distanceFactor={13} zIndexRange={[5, 0]}>
        <button
          className="pointer-events-auto select-none whitespace-nowrap rounded-lg px-2 py-0.5 text-[10px] font-bold text-white shadow-lg hover:scale-110 transition"
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

// 共有キャビネット(クリックで全社の成果物)
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
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[1.8, 1.9, 0.42]} />
        <meshStandardMaterial color="#e7e5e4" />
      </mesh>
      {[0.42, 0.95, 1.48].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0.03]}>
            <boxGeometry args={[1.7, 0.04, 0.38]} />
            <meshStandardMaterial color="#a8a29e" />
          </mesh>
          {[-0.55, -0.15, 0.25, 0.6].map((x, i) => (
            <mesh key={i} position={[x, y + 0.17, 0.08]}>
              <boxGeometry args={[0.16, 0.3, 0.24]} />
              <meshStandardMaterial
                color={["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444"][(i + Math.round(y * 2)) % 5]}
              />
            </mesh>
          ))}
        </group>
      ))}
      <Html position={[0, 2.35, 0]} center distanceFactor={13} zIndexRange={[5, 0]}>
        <button
          className="pointer-events-auto select-none whitespace-nowrap rounded-lg bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg hover:scale-110 transition"
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ kind: "shelf" });
          }}
        >
          🗄️ 共有キャビネット(全社データ)
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
  const W = MEETING_W;
  const D = MEETING_D;
  const H = 2.5;
  const glassMat = (
    <meshPhysicalMaterial
      color="#bfdbfe"
      transparent
      opacity={0.16}
      roughness={0.05}
      metalness={0}
      side={THREE.DoubleSide}
    />
  );
  return (
    <group>
      <mesh position={[cx, 0.012, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#475569" transparent opacity={0.35} />
      </mesh>
      <mesh position={[cx, H / 2, cz - D / 2]}>
        <planeGeometry args={[W, H]} />
        {glassMat}
      </mesh>
      <mesh position={[cx - W / 2, H / 2, cz]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[D, H]} />
        {glassMat}
      </mesh>
      <mesh position={[cx + W / 2, H / 2, cz]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[D, H]} />
        {glassMat}
      </mesh>
      <mesh position={[cx - W / 4 - 0.9, H / 2, cz + D / 2]}>
        <planeGeometry args={[W / 2 - 1.8, H]} />
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
          <meshStandardMaterial color="#1f2937" />
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
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}
      <mesh position={[cx, 0.74, cz]} castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 1.6, 0.07, 32]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[cx, 0.37, cz]} castShadow>
        <cylinderGeometry args={[0.1, 0.32, 0.74, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {MEETING_SEATS.map((s, i) => (
        <OfficeChair key={i} position={[s.pos[0], 0, s.pos[1]]} rotY={s.rot} />
      ))}
      {/* 大型ディスプレイ(クリックで議事録) */}
      <group
        position={[cx, 0, cz - D / 2 + 0.25]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ kind: "meeting" });
        }}
        onPointerOver={() => hoverCursor(true)}
        onPointerOut={() => hoverCursor(false)}
      >
        <mesh position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[2.2, 1.25, 0.08]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0, 1.5, 0.045]}>
          <boxGeometry args={[2.05, 1.1, 0.005]} />
          <meshStandardMaterial
            color={inMeeting ? "#86efac" : "#1e293b"}
            emissive={inMeeting ? "#22c55e" : "#0f172a"}
            emissiveIntensity={inMeeting ? 0.5 : 0.1}
          />
        </mesh>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.1, 0.8, 0.1]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      </group>
      <PendantLight position={[cx, 3.1, cz]} />
      <Html position={[cx, 3.0, cz]} center distanceFactor={14} zIndexRange={[5, 0]}>
        <button
          className={`pointer-events-auto select-none whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold shadow-lg hover:scale-110 transition ${
            inMeeting ? "bg-amber-500 text-white animate-pulse" : "bg-white/90 text-amber-700"
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
        <circleGeometry args={[3.4, 32]} />
        <meshStandardMaterial color="#fda4af" transparent opacity={0.25} />
      </mesh>
      <group position={[cx, 0, SOFA_Z + 0.15]}>
        <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.0, 0.42, 1.05]} />
          <meshStandardMaterial color="#0d9488" />
        </mesh>
        <mesh position={[0, 0.72, 0.45]} castShadow>
          <boxGeometry args={[3.0, 0.62, 0.22]} />
          <meshStandardMaterial color="#0f766e" />
        </mesh>
        {[-1.4, 1.4].map((ax) => (
          <mesh key={ax} position={[ax, 0.52, 0]} castShadow>
            <boxGeometry args={[0.22, 0.5, 1.05]} />
            <meshStandardMaterial color="#0f766e" />
          </mesh>
        ))}
        <mesh position={[-0.9, 0.62, 0.32]} rotation={[0.3, 0, 0.1]}>
          <boxGeometry args={[0.4, 0.4, 0.12]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
        <mesh position={[1.0, 0.62, 0.32]} rotation={[0.3, 0, -0.15]}>
          <boxGeometry args={[0.4, 0.4, 0.12]} />
          <meshStandardMaterial color="#f472b6" />
        </mesh>
      </group>
      {[
        [LOUNGE_CENTER[0] - 2.3, LOUNGE_CENTER[1] + 0.4],
        [LOUNGE_CENTER[0] + 2.4, LOUNGE_CENTER[1] + 0.4],
      ].map(([bx, bz], i) => (
        <mesh key={i} position={[bx, 0.22, bz]} castShadow>
          <sphereGeometry args={[0.42, 16, 12]} />
          <meshStandardMaterial color={i === 0 ? "#f59e0b" : "#8b5cf6"} />
        </mesh>
      ))}
      <group position={[cx, 0, cz + 0.6]}>
        <mesh position={[0, 0.36, 0]} castShadow>
          <cylinderGeometry args={[0.55, 0.55, 0.05, 24]} />
          <meshStandardMaterial color="#a16207" />
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.36, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      </group>
      <group position={[cx, 0, cz - 2.5]}>
        <mesh position={[0, 0.32, 0]} castShadow>
          <boxGeometry args={[2.0, 0.64, 0.42]} />
          <meshStandardMaterial color="#f5f5f4" />
        </mesh>
        <mesh position={[-0.6, 0.68, 0.05]}>
          <boxGeometry args={[0.3, 0.08, 0.22]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        <mesh position={[0, 1.35, 0]} castShadow>
          <boxGeometry args={[1.9, 1.08, 0.07]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0, 1.35, 0.04]}>
          <boxGeometry args={[1.76, 0.94, 0.005]} />
          <meshStandardMaterial color="#c4b5fd" emissive="#8b5cf6" emissiveIntensity={0.9} />
        </mesh>
      </group>
      <Html position={[cx, 2.9, cz]} center distanceFactor={14} zIndexRange={[5, 0]}>
        <div className="rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-bold text-sky-700 shadow-lg pointer-events-none select-none whitespace-nowrap">
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
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.2, 1.0, 0.8]} />
        <meshStandardMaterial color="#78716c" />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <boxGeometry args={[4.4, 0.06, 0.95]} />
        <meshStandardMaterial color="#f5f5f4" />
      </mesh>
      <mesh position={[-1.2, 1.25, 0]} castShadow>
        <boxGeometry args={[0.5, 0.4, 0.4]} />
        <meshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.3} />
      </mesh>
      {[-0.4, -0.1, 0.2].map((x, i) => (
        <mesh key={i} position={[x, 1.1, 0.1]}>
          <cylinderGeometry args={[0.045, 0.038, 0.09, 10]} />
          <meshStandardMaterial color={["#fbbf24", "#38bdf8", "#f8fafc"][i]} />
        </mesh>
      ))}
      {[-0.8, 0.8].map((x) => (
        <group key={x} position={[x, 0, 1.0]}>
          <mesh position={[0, 0.62, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.06, 16]} />
            <meshStandardMaterial color="#a16207" />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.03, 0.05, 0.6, 8]} />
            <meshStandardMaterial color="#1f2937" />
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
        <cylinderGeometry args={[0.22, 0.27, 0.44, 12]} />
        <meshStandardMaterial color="#d6d3d1" />
      </mesh>
      {[0, 1.2, 2.4, 3.6, 4.8].map((a, i) => (
        <mesh
          key={i}
          position={[Math.cos(a) * 0.2, 0.75 + (i % 2) * 0.25, Math.sin(a) * 0.2]}
          rotation={[0.5, a, 0]}
          castShadow
        >
          <sphereGeometry args={[0.24, 8, 6]} />
          <meshStandardMaterial color={i % 2 ? "#15803d" : "#16a34a"} />
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
        <meshStandardMaterial color="#d9c6a5" />
      </mesh>
      {Array.from({ length: 15 }, (_, i) => (
        <mesh key={i} position={[-14 + i * 2, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 21]} />
          <meshStandardMaterial color="#c2ab84" transparent opacity={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 1.7, -10.4]} receiveShadow>
        <boxGeometry args={[32, 3.4, 0.3]} />
        <meshStandardMaterial color="#f1f5f9" />
      </mesh>
      <mesh position={[-15.8, 1.7, 0]} receiveShadow>
        <boxGeometry args={[0.3, 3.4, 21]} />
        <meshStandardMaterial color="#b0604f" />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-15.63, 0.4 + i * 0.4, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[21, 0.02]} />
          <meshStandardMaterial color="#8f4a3c" />
        </mesh>
      ))}
      {[-13, -4.5, 2, 13].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.9, -10.23]}>
            <boxGeometry args={[3.4, 2.0, 0.05]} />
            <meshStandardMaterial color="#bfdbfe" emissive="#93c5fd" emissiveIntensity={0.3} />
          </mesh>
          {[0, 1, 2].map((b) => (
            <mesh key={b} position={[x - 1.0 + b * 1.0, 1.5 + (b % 2) * 0.3, -10.2]}>
              <boxGeometry args={[0.5, 0.9 + (b % 2) * 0.5, 0.01]} />
              <meshStandardMaterial color="#64748b" transparent opacity={0.45} />
            </mesh>
          ))}
        </group>
      ))}
      <Html position={[6, 2.85, -10.2]} center distanceFactor={16} zIndexRange={[4, 0]}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded-xl bg-slate-900/90 px-4 py-1.5 text-[14px] font-black tracking-wide text-white shadow-xl">
          AIbou <span className="text-amber-400">Office</span>
        </div>
      </Html>
      <Plant position={[-14.6, 0, -9.2]} big />
      <Plant position={[14.2, 0, -9.2]} big />
      <Plant position={[14.4, 0, 8.5]} big />
      <Plant position={[-3.4, 0, 8.6]} />
      <Plant position={[4.6, 0, 8.6]} />
      <mesh position={[0.5, 0.008, 1.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 2.4]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

// ================================================================
// ウォークモード(FPS)
// ================================================================

interface Hotspot {
  sel: OfficeSelection;
  center: THREE.Vector3;
  radius: number;
}

function WalkController({
  hotspots,
  onSelect,
  onLockChange,
}: {
  hotspots: Hotspot[];
  onSelect: (sel: OfficeSelection) => void;
  onLockChange: (locked: boolean) => void;
}) {
  const controls = useRef<PointerLockControlsImpl>(null);
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    camera.position.set(0.5, 1.6, 8.8);
    camera.lookAt(0.5, 1.4, 0);
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [camera]);

  // クリックで視線の先のオブジェクトを開く
  useEffect(() => {
    const dom = gl.domElement;
    const onClick = () => {
      const c = controls.current;
      if (!c || !c.isLocked) return;
      const origin = camera.position.clone();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const ray = new THREE.Ray(origin, dir);
      let best: { sel: OfficeSelection; dist: number } | null = null;
      for (const h of hotspots) {
        const hit = ray.intersectSphere(new THREE.Sphere(h.center, h.radius), new THREE.Vector3());
        if (hit) {
          const dist = origin.distanceTo(hit);
          if (dist < 8 && (!best || dist < best.dist)) best = { sel: h.sel, dist };
        }
      }
      if (best) {
        c.unlock();
        onSelect(best.sel);
      }
    };
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [camera, gl, hotspots, onSelect]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c || !c.isLocked) return;
    const k = keys.current;
    const speed = (k["ShiftLeft"] || k["ShiftRight"] ? 7 : 3.6) * delta;
    let f = 0;
    let r = 0;
    if (k["KeyW"] || k["ArrowUp"]) f += 1;
    if (k["KeyS"] || k["ArrowDown"]) f -= 1;
    if (k["KeyD"] || k["ArrowRight"]) r += 1;
    if (k["KeyA"] || k["ArrowLeft"]) r -= 1;
    if (f !== 0) c.moveForward(f * speed);
    if (r !== 0) c.moveRight(r * speed);
    // 部屋の中にクランプ
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -14.8, 14.8);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -9.6, 9.8);
    camera.position.y = 1.6;
  });

  return (
    <PointerLockControls
      ref={controls}
      onLock={() => onLockChange(true)}
      onUnlock={() => onLockChange(false)}
    />
  );
}

// ================================================================
// シーン本体
// ================================================================

function OfficeScene({
  mode,
  onSelect,
  onLockChange,
}: {
  mode: "orbit" | "walk";
  onSelect: (sel: OfficeSelection) => void;
  onLockChange: (locked: boolean) => void;
}) {
  const employees = useCompanyStore((s) => s.employees);
  const meetings = useCompanyStore((s) => s.meetings);
  const currentMeeting = meetings.find((m) => m.status === "in_progress");
  const participantIds = useMemo(
    () => currentMeeting?.participantIds ?? [],
    [currentMeeting]
  );

  const targets = useMemo(
    () => computeTargets(employees, participantIds),
    [employees, participantIds]
  );

  // デスクの割り当て(部署ごとに固定席)
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

  // ウォークモード用のクリック対象
  const hotspots = useMemo<Hotspot[]>(() => {
    const spots: Hotspot[] = [];
    deskAssignments.forEach((d) => {
      if (d.owner) {
        spots.push({
          sel: { kind: "employee", employeeId: d.owner.id },
          center: new THREE.Vector3(d.pos[0], 1.0, d.pos[2]),
          radius: 0.9,
        });
      }
    });
    (Object.keys(DEPT_CENTERS) as DepartmentId[]).forEach((dept) => {
      spots.push({
        sel: { kind: "whiteboard", department: dept },
        center: new THREE.Vector3(DEPT_CENTERS[dept][0], 1.55, -9.9),
        radius: 1.3,
      });
    });
    spots.push({
      sel: { kind: "shelf" },
      center: new THREE.Vector3(-15.2, 1.0, 0.2),
      radius: 1.4,
    });
    spots.push({
      sel: { kind: "meeting" },
      center: new THREE.Vector3(MEETING_CENTER[0], 1.5, MEETING_CENTER[1] - MEETING_D / 2 + 0.25),
      radius: 1.3,
    });
    return spots;
  }, [deskAssignments]);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[10, 18, 12]}
        intensity={1.5}
        color="#fff7ed"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <hemisphereLight args={["#dbeafe", "#d9c6a5", 0.4]} />

      <OfficeRoom />
      {(Object.keys(DEPT_CENTERS) as DepartmentId[]).map((dept) => {
        const d = DEPARTMENTS[dept];
        const [cx, cz] = DEPT_CENTERS[dept];
        return (
          <group key={dept}>
            <mesh position={[cx, 0.012, cz + 1.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[6.4, 6]} />
              <meshStandardMaterial color={d.color} transparent opacity={0.13} />
            </mesh>
            <PendantLight position={[cx, 3.1, cz + 1.4]} />
            <Whiteboard deptId={dept} onSelect={onSelect} />
            <Html position={[cx, 3.0, cz - 1.6]} center distanceFactor={14} zIndexRange={[5, 0]}>
              <div
                className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-white shadow-lg pointer-events-none select-none whitespace-nowrap"
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
        return <RobotCharacter key={e.id} employee={e} target={t} onSelect={onSelect} />;
      })}

      {mode === "orbit" ? (
        <OrbitControls
          target={[0, 0.4, 0]}
          maxPolarAngle={Math.PI / 2.18}
          minDistance={4}
          maxDistance={34}
          enableDamping
          dampingFactor={0.08}
        />
      ) : (
        <WalkController hotspots={hotspots} onSelect={onSelect} onLockChange={onLockChange} />
      )}
    </>
  );
}

export default function Office3D({
  onSelect,
}: {
  onSelect: (sel: OfficeSelection) => void;
}) {
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [locked, setLocked] = useState(false);

  return (
    <div className="relative h-[600px] w-full overflow-hidden rounded-3xl ring-1 ring-slate-200 shadow-sm bg-gradient-to-b from-sky-100 to-slate-100">
      <Canvas shadows camera={{ position: [1, 13, 16.5], fov: 45 }}>
        <OfficeScene mode={mode} onSelect={onSelect} onLockChange={setLocked} />
      </Canvas>

      {/* カメラモード切替 */}
      <div className="absolute left-3 top-3 flex gap-1 rounded-full bg-white/95 p-1 ring-1 ring-slate-200 shadow">
        <button
          onClick={() => setMode("orbit")}
          className={`rounded-full px-3 py-1 text-[10px] font-bold transition ${
            mode === "orbit" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          🎥 俯瞰ビュー
        </button>
        <button
          onClick={() => setMode("walk")}
          className={`rounded-full px-3 py-1 text-[10px] font-bold transition ${
            mode === "walk" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          🚶 ウォークモード
        </button>
      </div>

      {/* 操作ヒント */}
      {mode === "walk" && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-xl bg-slate-900/85 px-4 py-2 text-[11px] font-semibold text-white shadow-lg pointer-events-none whitespace-nowrap">
          {locked
            ? "WASD/矢印: 移動 ・ マウス: 見回す ・ Shift: ダッシュ ・ クリック: 調べる ・ Esc: 解除"
            : "画面をクリックしてオフィスの中を歩く(WASD移動・マウス視点)"}
        </div>
      )}
      {mode === "orbit" && (
        <div className="absolute bottom-3 left-3 rounded-lg bg-white/85 px-3 py-1.5 text-[10px] text-slate-500 shadow pointer-events-none">
          💡 ロボット社員・デスク・ホワイトボード・キャビネット・会議室モニターをクリックすると詳細が開きます
        </div>
      )}

      {/* クロスヘア */}
      {mode === "walk" && locked && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-3 w-3 rounded-full border-2 border-white/90 shadow-[0_0_4px_rgba(0,0,0,0.6)]" />
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useCompanyStore } from "@/lib/store";
import { DEPARTMENTS } from "@/lib/data";
import type { DepartmentId, Employee } from "@/lib/types";

// ================= レイアウト定義 =================

const DEPT_CENTERS: Record<DepartmentId, [number, number]> = {
  sales: [-8, -3.2],
  admin: [0, -3.2],
  marketing: [8, -3.2],
};

// 部署内のデスクスロット(部署中心からのオフセット)
const DESK_SLOTS: [number, number][] = [
  [-1.6, 0],
  [1.6, 0],
  [-1.6, 2.6],
  [1.6, 2.6],
];

const MEETING_CENTER: [number, number] = [-6.5, 4.8];
const BREAK_CENTER: [number, number] = [7.5, 4.8];

const HAIR_COLORS = ["#3b2f2f", "#5a3825", "#1f2937", "#7c5c3e", "#4a3728", "#2d2418"];

function hashIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h % mod;
}

interface CharTarget {
  pos: [number, number, number];
  rotY: number; // 到着後に向く方向
  sitting: boolean;
}

// 全社員の目標位置を状態から計算
function computeTargets(employees: Employee[], meetingParticipantIds: string[]): Map<string, CharTarget> {
  const targets = new Map<string, CharTarget>();
  const deptCounters: Record<DepartmentId, number> = { sales: 0, admin: 0, marketing: 0 };
  let breakCounter = 0;

  for (const emp of employees) {
    if (emp.status === "meeting" && meetingParticipantIds.includes(emp.id)) {
      const i = meetingParticipantIds.indexOf(emp.id);
      const angle = (i / Math.max(meetingParticipantIds.length, 3)) * Math.PI * 2 + Math.PI / 6;
      const r = 2.5;
      const x = MEETING_CENTER[0] + Math.cos(angle) * r;
      const z = MEETING_CENTER[1] + Math.sin(angle) * r;
      // テーブルの中心を向く
      targets.set(emp.id, {
        pos: [x, 0, z],
        rotY: Math.atan2(MEETING_CENTER[0] - x, MEETING_CENTER[1] - z),
        sitting: false,
      });
    } else if (emp.status === "break") {
      const offsets: [number, number][] = [
        [-1.0, 0.6],
        [1.0, 0.6],
        [-0.4, 1.8],
        [0.8, 1.8],
        [0, -0.4],
      ];
      const o = offsets[breakCounter % offsets.length];
      breakCounter++;
      const x = BREAK_CENTER[0] + o[0];
      const z = BREAK_CENTER[1] + o[1];
      // テレビ(ゲーム画面)の方を向く
      targets.set(emp.id, {
        pos: [x, 0, z],
        rotY: Math.atan2(BREAK_CENTER[0] - x, BREAK_CENTER[1] - 2.6 - z),
        sitting: false,
      });
    } else {
      const center = DEPT_CENTERS[emp.department];
      const slot = DESK_SLOTS[deptCounters[emp.department] % DESK_SLOTS.length];
      deptCounters[emp.department]++;
      // デスクの後ろ(手前側)に立ち、モニターへ向く(-z方向)
      targets.set(emp.id, {
        pos: [center[0] + slot[0], 0, center[1] + slot[1] + 0.85],
        rotY: Math.PI, // -z を向く
        sitting: false,
      });
    }
  }
  return targets;
}

// ================= 3Dキャラクター(ちびキャラ) =================

function Character({ employee, target }: { employee: Employee; target: CharTarget }) {
  const group = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Mesh>(null);
  const body = useRef<THREE.Group>(null);
  const walking = useRef(false);

  const hairColor = HAIR_COLORS[hashIndex(employee.id, HAIR_COLORS.length)];
  const shirtColor = employee.color;

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const targetV = new THREE.Vector3(target.pos[0], 0, target.pos[2]);
    const dist = g.position.distanceTo(targetV);

    if (dist > 0.08) {
      walking.current = true;
      const dir = targetV.clone().sub(g.position).normalize();
      const speed = Math.min(dist, 2.2 * delta);
      g.position.add(dir.multiplyScalar(speed));
      // 進行方向を向く
      const targetRot = Math.atan2(dir.x, dir.z);
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetRot, 0.2);
    } else {
      walking.current = false;
      // 到着:所定の向きへ
      let diff = target.rotY - g.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      g.rotation.y += diff * 0.1;
    }

    // 歩行アニメ / 待機アニメ
    const swing = walking.current ? Math.sin(t * 10) * 0.5 : 0;
    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.x = -swing * 0.8;
    if (rightArm.current) rightArm.current.rotation.x = swing * 0.8;
    if (body.current) {
      body.current.position.y = walking.current
        ? Math.abs(Math.sin(t * 10)) * 0.06
        : Math.sin(t * 2 + hashIndex(employee.id, 7)) * 0.025; // 待機中はゆったり上下
    }
  });

  const isGaming = employee.status === "break";
  const bubbleText =
    employee.currentTask && employee.status !== "break"
      ? employee.currentTask.detail
      : employee.statusLabel;

  return (
    <group ref={group} position={[target.pos[0], 0, target.pos[2]]}>
      <group ref={body}>
        {/* 脚 */}
        <mesh ref={leftLeg} position={[-0.12, 0.32, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.3, 4, 8]} />
          <meshStandardMaterial color="#3f4a5a" />
        </mesh>
        <mesh ref={rightLeg} position={[0.12, 0.32, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.3, 4, 8]} />
          <meshStandardMaterial color="#3f4a5a" />
        </mesh>
        {/* 胴体(シャツ=部署カラー) */}
        <mesh position={[0, 0.75, 0]} castShadow>
          <capsuleGeometry args={[0.26, 0.42, 8, 16]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        {/* 腕 */}
        <mesh ref={leftArm} position={[-0.34, 0.78, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.34, 4, 8]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        <mesh ref={rightArm} position={[0.34, 0.78, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.34, 4, 8]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        {/* 頭(ちびキャラ比率で大きめ) */}
        <mesh position={[0, 1.32, 0]} castShadow>
          <sphereGeometry args={[0.3, 24, 24]} />
          <meshStandardMaterial color="#f6cfae" />
        </mesh>
        {/* 髪 */}
        <mesh position={[0, 1.46, -0.03]} castShadow>
          <sphereGeometry args={[0.29, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshStandardMaterial color={hairColor} />
        </mesh>
        {/* 目 */}
        <mesh position={[-0.1, 1.32, 0.26]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh position={[0.1, 1.32, 0.26]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        {/* 休憩中はゲームコントローラーを持つ */}
        {isGaming && (
          <mesh position={[0, 0.62, 0.3]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.28, 0.06, 0.14]} />
            <meshStandardMaterial color="#374151" />
          </mesh>
        )}
      </group>
      {/* 名前+吹き出し */}
      <Html position={[0, 2.05, 0]} center distanceFactor={12} occlude={false} zIndexRange={[10, 0]}>
        <div className="flex flex-col items-center pointer-events-none select-none" style={{ width: "150px" }}>
          <div className="rounded-md bg-white/95 px-1.5 py-0.5 text-[9px] leading-tight text-slate-700 shadow ring-1 ring-slate-200 text-center max-w-[150px]">
            {bubbleText}
          </div>
          <div
            className="mt-0.5 rounded-full px-1.5 py-px text-[9px] font-bold text-white shadow"
            style={{ backgroundColor: employee.color }}
          >
            {employee.name}
          </div>
        </div>
      </Html>
    </group>
  );
}

// ================= 家具・内装 =================

function Desk({ position }: { position: [number, number, number] }) {
  const [x, , z] = position;
  return (
    <group position={[x, 0, z]}>
      {/* 天板 */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.06, 0.75]} />
        <meshStandardMaterial color="#b98a5a" />
      </mesh>
      {/* 脚 */}
      {[
        [-0.68, -0.3],
        [0.68, -0.3],
        [-0.68, 0.3],
        [0.68, 0.3],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.36, lz]} castShadow>
          <boxGeometry args={[0.06, 0.72, 0.06]} />
          <meshStandardMaterial color="#8a6844" />
        </mesh>
      ))}
      {/* モニター */}
      <mesh position={[0, 1.02, -0.18]} castShadow>
        <boxGeometry args={[0.55, 0.36, 0.04]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[0, 1.02, -0.157]}>
        <boxGeometry args={[0.48, 0.29, 0.005]} />
        <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0.79, -0.18]}>
        <boxGeometry args={[0.08, 0.1, 0.08]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* キーボード */}
      <mesh position={[0, 0.76, 0.12]}>
        <boxGeometry args={[0.4, 0.02, 0.14]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
    </group>
  );
}

function DeptZone({ deptId }: { deptId: DepartmentId }) {
  const dept = DEPARTMENTS[deptId];
  const [cx, cz] = DEPT_CENTERS[deptId];
  return (
    <group>
      {/* ラグ(部署カラー) */}
      <mesh position={[cx, 0.011, cz + 1.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 5.6]} />
        <meshStandardMaterial color={dept.color} transparent opacity={0.16} />
      </mesh>
      {DESK_SLOTS.map((s, i) => (
        <Desk key={i} position={[cx + s[0], 0, cz + s[1]]} />
      ))}
      {/* 部署名サイン */}
      <Html position={[cx, 2.6, cz - 1.2]} center distanceFactor={14} zIndexRange={[5, 0]}>
        <div
          className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-white shadow-lg pointer-events-none select-none whitespace-nowrap"
          style={{ backgroundColor: dept.color }}
        >
          {dept.name}
        </div>
      </Html>
    </group>
  );
}

function MeetingRoom({ inMeeting }: { inMeeting: boolean }) {
  const [cx, cz] = MEETING_CENTER;
  return (
    <group>
      <mesh position={[cx, 0.011, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3.4, 32]} />
        <meshStandardMaterial color="#f59e0b" transparent opacity={0.14} />
      </mesh>
      {/* 丸テーブル */}
      <mesh position={[cx, 0.74, cz]} castShadow receiveShadow>
        <cylinderGeometry args={[1.7, 1.7, 0.08, 32]} />
        <meshStandardMaterial color="#c9a06a" />
      </mesh>
      <mesh position={[cx, 0.37, cz]} castShadow>
        <cylinderGeometry args={[0.12, 0.35, 0.74, 16]} />
        <meshStandardMaterial color="#8a6844" />
      </mesh>
      {/* ホワイトボード */}
      <group position={[cx - 3.4, 0, cz + 0.5]} rotation={[0, Math.PI / 2.5, 0]}>
        <mesh position={[0, 1.3, 0]} castShadow>
          <boxGeometry args={[2, 1.2, 0.06]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.08, 0.7, 0.08]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      </group>
      <Html position={[cx, 2.7, cz]} center distanceFactor={14} zIndexRange={[5, 0]}>
        <div
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold shadow-lg pointer-events-none select-none whitespace-nowrap ${
            inMeeting ? "bg-amber-500 text-white animate-pulse" : "bg-white/90 text-amber-700"
          }`}
        >
          🤝 会議室{inMeeting ? " MTG中" : ""}
        </div>
      </Html>
    </group>
  );
}

function BreakSpace() {
  const [cx, cz] = BREAK_CENTER;
  return (
    <group>
      <mesh position={[cx, 0.011, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6.4, 5.6]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.12} />
      </mesh>
      {/* ソファ */}
      <group position={[cx, 0, cz + 1.9]}>
        <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.6, 0.5, 1]} />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
        <mesh position={[0, 0.66, 0.42]} castShadow>
          <boxGeometry args={[2.6, 0.7, 0.22]} />
          <meshStandardMaterial color="#3b82f6" />
        </mesh>
      </group>
      {/* ゲームTV */}
      <group position={[cx, 0, cz - 2.6]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[1.6, 0.7, 0.4]} />
          <meshStandardMaterial color="#e7e5e4" />
        </mesh>
        <mesh position={[0, 1.25, 0]} castShadow>
          <boxGeometry args={[1.7, 1.0, 0.08]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        <mesh position={[0, 1.25, 0.045]}>
          <boxGeometry args={[1.56, 0.86, 0.005]} />
          <meshStandardMaterial color="#a78bfa" emissive="#8b5cf6" emissiveIntensity={0.8} />
        </mesh>
      </group>
      <Html position={[cx, 2.7, cz]} center distanceFactor={14} zIndexRange={[5, 0]}>
        <div className="rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-bold text-sky-700 shadow-lg pointer-events-none select-none whitespace-nowrap">
          🎮 休憩スペース
        </div>
      </Html>
    </group>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.4, 12]} />
        <meshStandardMaterial color="#b45309" />
      </mesh>
      <mesh position={[0, 0.75, 0]} castShadow>
        <sphereGeometry args={[0.42, 12, 12]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>
    </group>
  );
}

function OfficeRoom() {
  return (
    <group>
      {/* 床 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[28, 19]} />
        <meshStandardMaterial color="#e0cfb0" />
      </mesh>
      {/* 床の目地ライン */}
      {Array.from({ length: 13 }, (_, i) => (
        <mesh key={i} position={[-12 + i * 2, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.03, 19]} />
          <meshStandardMaterial color="#cdb894" transparent opacity={0.35} />
        </mesh>
      ))}
      {/* 壁(奥・左) */}
      <mesh position={[0, 1.6, -9.5]} receiveShadow>
        <boxGeometry args={[28, 3.2, 0.3]} />
        <meshStandardMaterial color="#eef0f4" />
      </mesh>
      <mesh position={[-14, 1.6, 0]} receiveShadow>
        <boxGeometry args={[0.3, 3.2, 19]} />
        <meshStandardMaterial color="#e8eaef" />
      </mesh>
      {/* 奥の窓 */}
      {[-9, -3, 3, 9].map((x) => (
        <mesh key={x} position={[x, 1.8, -9.33]}>
          <boxGeometry args={[3.4, 1.5, 0.05]} />
          <meshStandardMaterial color="#bae6fd" emissive="#7dd3fc" emissiveIntensity={0.25} />
        </mesh>
      ))}
      <Plant position={[-12.6, 0, -8]} />
      <Plant position={[12.6, 0, -8]} />
      <Plant position={[-12.6, 0, 8]} />
      <Plant position={[0.5, 0, 7.5]} />
    </group>
  );
}

// ================= シーン本体 =================

function OfficeScene() {
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

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[8, 16, 10]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      <hemisphereLight args={["#dbeafe", "#e0cfb0", 0.35]} />

      <OfficeRoom />
      <DeptZone deptId="sales" />
      <DeptZone deptId="admin" />
      <DeptZone deptId="marketing" />
      <MeetingRoom inMeeting={!!currentMeeting} />
      <BreakSpace />

      {employees.map((e) => {
        const t = targets.get(e.id);
        if (!t) return null;
        return <Character key={e.id} employee={e} target={t} />;
      })}

      <OrbitControls
        target={[0, 0.5, 0]}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={6}
        maxDistance={32}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

export default function Office3D() {
  return (
    <div className="h-[560px] w-full overflow-hidden rounded-3xl ring-1 ring-slate-200 shadow-sm bg-gradient-to-b from-sky-100 to-slate-100">
      <Canvas shadows camera={{ position: [0, 13, 15.5], fov: 45 }}>
        <OfficeScene />
      </Canvas>
    </div>
  );
}

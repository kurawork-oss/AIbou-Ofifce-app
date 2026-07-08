"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useCompanyStore } from "@/lib/store";
import { DEPARTMENTS } from "@/lib/data";
import type { DepartmentId, Employee } from "@/lib/types";

// ================================================================
// レイアウト定義(海外スタートアップ風ワンフロアオフィス)
// 床: 30 x 20(x: -15..15, z: -10..10)
// ================================================================

const DEPT_CENTERS: Record<DepartmentId, [number, number]> = {
  sales: [-9, -4.2],
  admin: [0, -4.2],
  marketing: [9, -4.2],
};

// 部署内のデスクスロット(部署中心からのオフセット)
const DESK_SLOTS: [number, number][] = [
  [-1.7, 0],
  [1.7, 0],
  [-1.7, 2.8],
  [1.7, 2.8],
];

const MEETING_CENTER: [number, number] = [-7.5, 5.2];
const LOUNGE_CENTER: [number, number] = [9, 5.2];
const KITCHEN_CENTER: [number, number] = [0.5, 8.2];

// 会議室の椅子(テーブル周り6席)
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

// ラウンジの席(ソファ3席 + ビーズクッション2)
const SOFA_Z = LOUNGE_CENTER[1] + 2.1;
const LOUNGE_SEATS: { pos: [number, number]; rot: number; kind: "sofa" | "bean" }[] = [
  { pos: [LOUNGE_CENTER[0] - 0.85, SOFA_Z], rot: Math.PI, kind: "sofa" },
  { pos: [LOUNGE_CENTER[0] + 0.05, SOFA_Z], rot: Math.PI, kind: "sofa" },
  { pos: [LOUNGE_CENTER[0] + 0.95, SOFA_Z], rot: Math.PI, kind: "sofa" },
  { pos: [LOUNGE_CENTER[0] - 2.3, LOUNGE_CENTER[1] + 0.4], rot: Math.PI * 0.8, kind: "bean" },
  { pos: [LOUNGE_CENTER[0] + 2.4, LOUNGE_CENTER[1] + 0.4], rot: -Math.PI * 0.8, kind: "bean" },
];

// ================================================================
// 社員ごとの見た目(個性)
// ================================================================

type HairStyle = "short" | "long" | "bun" | "ponytail" | "parted";

interface Appearance {
  skin: string;
  hairColor: string;
  hairStyle: HairStyle;
  glasses: boolean;
  height: number; // 全体スケール
  accessory: "tie" | "scarf" | "lanyard" | "none";
}

const SKINS = ["#f6cfae", "#eec39a", "#d9a066", "#a9714b"];
const HAIR_COLORS = ["#2b2117", "#4a3728", "#6b4a2f", "#1f2937", "#8a5a2b", "#3d3d3d"];
const HAIR_STYLES: HairStyle[] = ["short", "long", "bun", "ponytail", "parted"];
const ACCESSORIES: Appearance["accessory"][] = ["tie", "scarf", "lanyard", "none"];

function hash(str: string, mod: number): number {
  let h = 7;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 99991;
  return h % mod;
}

// 初期メンバーは印象が固定されるように明示的な見た目を設定
const APPEARANCE_OVERRIDES: Record<string, Partial<Appearance>> = {
  "emp-sato": { hairStyle: "short", accessory: "tie", glasses: false, height: 1.08 },
  "emp-takahashi": { hairStyle: "ponytail", accessory: "lanyard", glasses: false, height: 0.97 },
  "emp-suzuki": { hairStyle: "bun", accessory: "scarf", glasses: true, height: 1.0 },
  "emp-tanaka": { hairStyle: "long", accessory: "lanyard", glasses: false, height: 0.93 },
  "emp-ito": { hairStyle: "parted", accessory: "none", glasses: true, height: 1.1 },
  "emp-watanabe": { hairStyle: "long", accessory: "scarf", glasses: false, height: 0.95 },
};

function appearanceFor(emp: Employee): Appearance {
  const base: Appearance = {
    skin: SKINS[hash(emp.id + "skin", SKINS.length)],
    hairColor: HAIR_COLORS[hash(emp.id + "hair", HAIR_COLORS.length)],
    hairStyle: HAIR_STYLES[hash(emp.id + "style", HAIR_STYLES.length)],
    glasses: hash(emp.id + "glass", 3) === 0,
    height: 0.92 + hash(emp.id + "h", 5) * 0.045,
    accessory: ACCESSORIES[hash(emp.id + "acc", ACCESSORIES.length)],
  };
  return { ...base, ...APPEARANCE_OVERRIDES[emp.id] };
}

// ================================================================
// 目標位置の計算
// ================================================================

interface CharTarget {
  pos: [number, number, number];
  rotY: number;
  sitting: boolean;
  seatHeight: number; // 座面の高さ(sitting時)
  pose: "work" | "meeting" | "game" | "idle";
}

function computeTargets(
  employees: Employee[],
  meetingParticipantIds: string[]
): Map<string, CharTarget> {
  const targets = new Map<string, CharTarget>();
  const deptCounters: Record<DepartmentId, number> = { sales: 0, admin: 0, marketing: 0 };
  let breakCounter = 0;

  for (const emp of employees) {
    if (emp.status === "meeting" && meetingParticipantIds.includes(emp.id)) {
      const i = meetingParticipantIds.indexOf(emp.id);
      const seat = MEETING_SEATS[i % MEETING_SEATS.length];
      targets.set(emp.id, {
        pos: [seat.pos[0], 0, seat.pos[1]],
        rotY: seat.rot,
        sitting: true,
        seatHeight: 0.46,
        pose: "meeting",
      });
    } else if (emp.status === "break") {
      const seat = LOUNGE_SEATS[breakCounter % LOUNGE_SEATS.length];
      breakCounter++;
      targets.set(emp.id, {
        pos: [seat.pos[0], 0, seat.pos[1]],
        rotY: seat.rot,
        sitting: true,
        seatHeight: seat.kind === "sofa" ? 0.5 : 0.32,
        pose: "game",
      });
    } else {
      const center = DEPT_CENTERS[emp.department];
      const slot = DESK_SLOTS[deptCounters[emp.department] % DESK_SLOTS.length];
      deptCounters[emp.department]++;
      targets.set(emp.id, {
        pos: [center[0] + slot[0], 0, center[1] + slot[1] + 0.72],
        rotY: Math.PI, // モニター(-z)を向く
        sitting: true,
        seatHeight: 0.46,
        pose: "work",
      });
    }
  }
  return targets;
}

// ================================================================
// 3Dキャラクター
// ================================================================

function Hair({ style, color }: { style: HairStyle; color: string }) {
  return (
    <group>
      {/* ベースの髪(頭頂) */}
      {style !== "parted" && (
        <mesh position={[0, 1.47, -0.02]} castShadow>
          <sphereGeometry args={[0.295, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {style === "parted" && (
        <>
          <mesh position={[0, 1.5, -0.04]} rotation={[0.15, 0, 0.08]} castShadow>
            <sphereGeometry args={[0.29, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0.12, 1.44, 0.2]} rotation={[0.5, 0, -0.2]}>
            <boxGeometry args={[0.16, 0.05, 0.12]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </>
      )}
      {style === "long" && (
        <>
          {/* 後ろ髪 */}
          <mesh position={[0, 1.18, -0.18]} castShadow>
            <capsuleGeometry args={[0.16, 0.34, 4, 12]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[-0.2, 1.22, -0.08]}>
            <capsuleGeometry args={[0.08, 0.3, 4, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0.2, 1.22, -0.08]}>
            <capsuleGeometry args={[0.08, 0.3, 4, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </>
      )}
      {style === "bun" && (
        <mesh position={[0, 1.66, -0.12]} castShadow>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {style === "ponytail" && (
        <mesh position={[0, 1.42, -0.3]} rotation={[0.7, 0, 0]} castShadow>
          <capsuleGeometry args={[0.09, 0.4, 4, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
    </group>
  );
}

function Accessory({ kind, shirt }: { kind: Appearance["accessory"]; shirt: string }) {
  if (kind === "tie") {
    return (
      <mesh position={[0, 0.82, 0.25]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[0.08, 0.34, 0.03]} />
        <meshStandardMaterial color="#7f1d1d" />
      </mesh>
    );
  }
  if (kind === "scarf") {
    return (
      <mesh position={[0, 1.02, 0]}>
        <torusGeometry args={[0.2, 0.06, 8, 16]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
    );
  }
  if (kind === "lanyard") {
    return (
      <group>
        <mesh position={[0, 0.95, 0.26]} rotation={[0.1, 0, 0]}>
          <boxGeometry args={[0.02, 0.24, 0.01]} />
          <meshStandardMaterial color="#1d4ed8" />
        </mesh>
        <mesh position={[0, 0.78, 0.27]}>
          <boxGeometry args={[0.12, 0.16, 0.01]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      </group>
    );
  }
  void shirt;
  return null;
}

function Character({ employee, target }: { employee: Employee; target: CharTarget }) {
  const group = useRef<THREE.Group>(null);
  const bodyGroup = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Group>(null);
  const sitFactor = useRef(0); // 0=立ち 1=着席

  const look = useMemo(() => appearanceFor(employee), [employee]);
  const shirt = employee.color;

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const phase = hash(employee.id, 100) / 15;
    const targetV = new THREE.Vector3(target.pos[0], 0, target.pos[2]);
    const dist = g.position.distanceTo(targetV);
    const walking = dist > 0.1;

    if (walking) {
      const dir = targetV.clone().sub(g.position).normalize();
      g.position.add(dir.multiplyScalar(Math.min(dist, 2.4 * delta)));
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

    // 着席モーション(歩行中は必ず立つ)
    const sitTarget = !walking && target.sitting ? 1 : 0;
    sitFactor.current = THREE.MathUtils.lerp(sitFactor.current, sitTarget, 0.12);
    const s = sitFactor.current;

    // 座ると腰の高さを座面に合わせて落とす(立位の腰高 ~0.6)
    const drop = Math.max(0, 0.55 - target.seatHeight) * s;
    if (bodyGroup.current) {
      bodyGroup.current.position.y =
        -drop +
        (walking
          ? Math.abs(Math.sin(t * 10)) * 0.06
          : Math.sin(t * 1.6 + phase) * 0.02);
    }

    // 脚:歩行スイング ⇔ 着席(太もも水平)
    const swing = walking ? Math.sin(t * 10 + phase) * 0.55 : 0;
    if (leftLeg.current) {
      leftLeg.current.rotation.x = THREE.MathUtils.lerp(swing, -1.45, s);
      leftLeg.current.position.z = THREE.MathUtils.lerp(0, 0.12, s);
    }
    if (rightLeg.current) {
      rightLeg.current.rotation.x = THREE.MathUtils.lerp(-swing, -1.45, s);
      rightLeg.current.position.z = THREE.MathUtils.lerp(0, 0.12, s);
    }

    // 腕:ポーズごとのアニメーション
    let armL = walking ? -swing * 0.7 : 0;
    let armR = walking ? swing * 0.7 : 0;
    if (!walking && s > 0.5) {
      if (target.pose === "work") {
        // タイピング:前へ伸ばして小刻みに動く
        armL = -0.95 + Math.sin(t * 7 + phase) * 0.06;
        armR = -0.95 + Math.cos(t * 6.3 + phase) * 0.06;
      } else if (target.pose === "game") {
        // コントローラーを握って左右に傾く
        armL = -1.1 + Math.sin(t * 3 + phase) * 0.05;
        armR = -1.1 + Math.sin(t * 3 + phase) * 0.05;
      } else if (target.pose === "meeting") {
        // 身振り:時々手を上げる
        const gesture = Math.max(0, Math.sin(t * 0.9 + phase * 2));
        armL = -0.3 - gesture * 0.5;
        armR = -0.2 + Math.sin(t * 1.3 + phase) * 0.1;
      }
    }
    if (leftArm.current) leftArm.current.rotation.x = THREE.MathUtils.lerp(leftArm.current.rotation.x, armL, 0.2);
    if (rightArm.current) rightArm.current.rotation.x = THREE.MathUtils.lerp(rightArm.current.rotation.x, armR, 0.2);

    // 頭:会議中はうなずく、作業中は少し下向き
    if (head.current) {
      const nod =
        target.pose === "meeting" && s > 0.5
          ? Math.sin(t * 2.2 + phase) * 0.08
          : target.pose === "work" && s > 0.5
            ? 0.12
            : 0;
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, nod, 0.1);
    }
  });

  const isGaming = target.pose === "game";
  const bubbleText =
    employee.currentTask && employee.status !== "break"
      ? employee.currentTask.detail
      : employee.statusLabel;

  return (
    <group ref={group} position={[target.pos[0], 0, target.pos[2]]} scale={look.height}>
      <group ref={bodyGroup}>
        {/* 脚(腰=グループ原点を支点に回転) */}
        <group ref={leftLeg} position={[-0.12, 0.6, 0]}>
          <mesh position={[0, -0.27, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.34, 4, 8]} />
            <meshStandardMaterial color="#3f4a5a" />
          </mesh>
        </group>
        <group ref={rightLeg} position={[0.12, 0.6, 0]}>
          <mesh position={[0, -0.27, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.34, 4, 8]} />
            <meshStandardMaterial color="#3f4a5a" />
          </mesh>
        </group>
        {/* 胴体 */}
        <mesh position={[0, 0.8, 0]} castShadow>
          <capsuleGeometry args={[0.27, 0.42, 8, 16]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        <Accessory kind={look.accessory} shirt={shirt} />
        {/* 腕(肩を支点に) */}
        <mesh ref={leftArm} position={[-0.35, 0.98, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.36, 4, 8]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        <mesh ref={rightArm} position={[0.35, 0.98, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.36, 4, 8]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        {/* 頭 */}
        <group ref={head}>
          <mesh position={[0, 1.34, 0]} castShadow>
            <sphereGeometry args={[0.3, 24, 24]} />
            <meshStandardMaterial color={look.skin} />
          </mesh>
          <Hair style={look.hairStyle} color={look.hairColor} />
          {/* 目 */}
          <mesh position={[-0.1, 1.34, 0.26]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh position={[0.1, 1.34, 0.26]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          {/* メガネ */}
          {look.glasses && (
            <group position={[0, 1.34, 0.27]}>
              <mesh position={[-0.1, 0, 0]}>
                <torusGeometry args={[0.07, 0.012, 8, 16]} />
                <meshStandardMaterial color="#111827" />
              </mesh>
              <mesh position={[0.1, 0, 0]}>
                <torusGeometry args={[0.07, 0.012, 8, 16]} />
                <meshStandardMaterial color="#111827" />
              </mesh>
              <mesh>
                <boxGeometry args={[0.07, 0.012, 0.012]} />
                <meshStandardMaterial color="#111827" />
              </mesh>
            </group>
          )}
        </group>
        {/* ゲームコントローラー */}
        {isGaming && (
          <mesh position={[0, 0.72, 0.34]} rotation={[0.4, 0, 0]}>
            <boxGeometry args={[0.3, 0.07, 0.15]} />
            <meshStandardMaterial color="#374151" />
          </mesh>
        )}
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
            {employee.name}
          </div>
        </div>
      </Html>
    </group>
  );
}

// ================================================================
// 家具
// ================================================================

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

function Desk({ position }: { position: [number, number, number] }) {
  const [x, , z] = position;
  return (
    <group position={[x, 0, z]}>
      {/* 白い天板(海外オフィス風) */}
      <mesh position={[0, 0.73, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.55, 0.05, 0.78]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {/* 黒スチール脚 */}
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
      {/* デュアルっぽい大きめモニター */}
      <mesh position={[0, 1.06, -0.2]} castShadow>
        <boxGeometry args={[0.62, 0.38, 0.04]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0, 1.06, -0.177]}>
        <boxGeometry args={[0.56, 0.32, 0.005]} />
        <meshStandardMaterial color="#93c5fd" emissive="#3b82f6" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0, 0.81, -0.2]}>
        <boxGeometry args={[0.07, 0.12, 0.07]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* キーボード・マウス・マグカップ */}
      <mesh position={[-0.05, 0.77, 0.1]}>
        <boxGeometry args={[0.4, 0.02, 0.14]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[0.3, 0.77, 0.12]}>
        <capsuleGeometry args={[0.03, 0.04, 4, 8]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[-0.55, 0.81, -0.1]}>
        <cylinderGeometry args={[0.05, 0.04, 0.11, 12]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      {/* 椅子(背もたれは通路側) */}
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

function DeptZone({ deptId }: { deptId: DepartmentId }) {
  const dept = DEPARTMENTS[deptId];
  const [cx, cz] = DEPT_CENTERS[deptId];
  return (
    <group>
      {/* エリアラグ */}
      <mesh position={[cx, 0.012, cz + 1.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6.4, 6]} />
        <meshStandardMaterial color={dept.color} transparent opacity={0.13} />
      </mesh>
      {DESK_SLOTS.map((s, i) => (
        <Desk key={i} position={[cx + s[0], 0, cz + s[1]]} />
      ))}
      <PendantLight position={[cx, 3.1, cz + 1.4]} />
      {/* 部署名サイン */}
      <Html position={[cx, 3.0, cz - 1.6]} center distanceFactor={14} zIndexRange={[5, 0]}>
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

// ガラス張り会議室(海外オフィス定番)
function GlassMeetingRoom({ inMeeting }: { inMeeting: boolean }) {
  const [cx, cz] = MEETING_CENTER;
  const W = 7.2; // x幅
  const D = 5.6; // z奥行
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
      {/* 会議室の床(濃いカーペット) */}
      <mesh position={[cx, 0.012, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#475569" transparent opacity={0.35} />
      </mesh>
      {/* ガラス壁(手前側は入口として半分だけ) */}
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
      {/* フレーム(黒スチール) */}
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
      {/* 丸テーブル(白天板) */}
      <mesh position={[cx, 0.74, cz]} castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 1.6, 0.07, 32]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[cx, 0.37, cz]} castShadow>
        <cylinderGeometry args={[0.1, 0.32, 0.74, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* テーブル上:ノートPCと書類 */}
      <mesh position={[cx - 0.5, 0.8, cz + 0.3]} rotation={[0, 0.5, 0]}>
        <boxGeometry args={[0.3, 0.02, 0.2]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh position={[cx + 0.4, 0.78, cz - 0.3]} rotation={[0, -0.3, 0]}>
        <boxGeometry args={[0.24, 0.005, 0.32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* 椅子6脚 */}
      {MEETING_SEATS.map((s, i) => (
        <OfficeChair key={i} position={[s.pos[0], 0, s.pos[1]]} rotY={s.rot} />
      ))}
      {/* 大型ディスプレイ(壁際) */}
      <group position={[cx, 0, cz - D / 2 + 0.25]}>
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

// ラウンジ(ソファ・ビーズクッション・ゲームTV・コーヒーテーブル)
function Lounge() {
  const [cx, cz] = LOUNGE_CENTER;
  return (
    <group>
      {/* ラグ */}
      <mesh position={[cx, 0.012, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3.4, 32]} />
        <meshStandardMaterial color="#fda4af" transparent opacity={0.25} />
      </mesh>
      {/* 3人掛けソファ */}
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
        {/* クッション */}
        <mesh position={[-0.9, 0.62, 0.32]} rotation={[0.3, 0, 0.1]}>
          <boxGeometry args={[0.4, 0.4, 0.12]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
        <mesh position={[1.0, 0.62, 0.32]} rotation={[0.3, 0, -0.15]}>
          <boxGeometry args={[0.4, 0.4, 0.12]} />
          <meshStandardMaterial color="#f472b6" />
        </mesh>
      </group>
      {/* ビーズクッション */}
      {LOUNGE_SEATS.filter((s) => s.kind === "bean").map((s, i) => (
        <mesh key={i} position={[s.pos[0], 0.22, s.pos[1]]} castShadow>
          <sphereGeometry args={[0.42, 16, 12]} />
          <meshStandardMaterial color={i === 0 ? "#f59e0b" : "#8b5cf6"} />
        </mesh>
      ))}
      {/* コーヒーテーブル */}
      <group position={[cx, 0, cz + 0.6]}>
        <mesh position={[0, 0.36, 0]} castShadow>
          <cylinderGeometry args={[0.55, 0.55, 0.05, 24]} />
          <meshStandardMaterial color="#a16207" />
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.36, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0.15, 0.43, 0]}>
          <cylinderGeometry args={[0.04, 0.035, 0.09, 10]} />
          <meshStandardMaterial color="#f97316" />
        </mesh>
      </group>
      {/* ゲームTV(スタンド型) */}
      <group position={[cx, 0, cz - 2.5]}>
        <mesh position={[0, 0.32, 0]} castShadow>
          <boxGeometry args={[2.0, 0.64, 0.42]} />
          <meshStandardMaterial color="#f5f5f4" />
        </mesh>
        {/* ゲーム機 */}
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
      {/* フロアランプ */}
      <group position={[cx + 3.1, 0, cz + 2.2]}>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 1.6, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0, 1.7, 0]}>
          <coneGeometry args={[0.22, 0.28, 16, 1, true]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fbbf24" emissiveIntensity={0.7} side={THREE.DoubleSide} />
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

// キッチンカウンター(コーヒーバー)
function CoffeeBar() {
  const [cx, cz] = KITCHEN_CENTER;
  return (
    <group position={[cx, 0, cz]}>
      {/* カウンター */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.2, 1.0, 0.8]} />
        <meshStandardMaterial color="#78716c" />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <boxGeometry args={[4.4, 0.06, 0.95]} />
        <meshStandardMaterial color="#f5f5f4" />
      </mesh>
      {/* エスプレッソマシン */}
      <mesh position={[-1.2, 1.25, 0]} castShadow>
        <boxGeometry args={[0.5, 0.4, 0.4]} />
        <meshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.3} />
      </mesh>
      {/* カップ */}
      {[-0.4, -0.1, 0.2].map((x, i) => (
        <mesh key={i} position={[x, 1.1, 0.1]}>
          <cylinderGeometry args={[0.045, 0.038, 0.09, 10]} />
          <meshStandardMaterial color={["#fbbf24", "#38bdf8", "#f8fafc"][i]} />
        </mesh>
      ))}
      {/* フルーツボウル */}
      <mesh position={[1.1, 1.09, 0]}>
        <sphereGeometry args={[0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshStandardMaterial color="#0ea5e9" side={THREE.DoubleSide} />
      </mesh>
      {/* スツール2脚 */}
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
      <Html position={[0, 2.3, 0]} center distanceFactor={14} zIndexRange={[5, 0]}>
        <div className="rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-bold text-stone-600 shadow-lg pointer-events-none select-none whitespace-nowrap">
          ☕ コーヒーバー
        </div>
      </Html>
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
      {/* モンステラ風の葉 */}
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

function Bookshelf({ position, rotY = 0 }: { position: [number, number, number]; rotY?: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[1.6, 1.8, 0.35]} />
        <meshStandardMaterial color="#a8a29e" />
      </mesh>
      {[0.35, 0.9, 1.45].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0.02]}>
            <boxGeometry args={[1.5, 0.04, 0.32]} />
            <meshStandardMaterial color="#78716c" />
          </mesh>
          {[-0.5, -0.2, 0.15, 0.45].map((x, i) => (
            <mesh key={i} position={[x, y + 0.16, 0.05]}>
              <boxGeometry args={[0.09, 0.28, 0.2]} />
              <meshStandardMaterial
                color={["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed"][(i + Math.round(y * 2)) % 5]}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function OfficeRoom() {
  return (
    <group>
      {/* 床:ライトオーク */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[32, 21]} />
        <meshStandardMaterial color="#d9c6a5" />
      </mesh>
      {/* フローリングの目地 */}
      {Array.from({ length: 15 }, (_, i) => (
        <mesh key={i} position={[-14 + i * 2, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.025, 21]} />
          <meshStandardMaterial color="#c2ab84" transparent opacity={0.5} />
        </mesh>
      ))}
      {/* 奥の壁(白) */}
      <mesh position={[0, 1.7, -10.4]} receiveShadow>
        <boxGeometry args={[32, 3.4, 0.3]} />
        <meshStandardMaterial color="#f1f5f9" />
      </mesh>
      {/* 左の壁:レンガ調アクセントウォール */}
      <mesh position={[-15.8, 1.7, 0]} receiveShadow>
        <boxGeometry args={[0.3, 3.4, 21]} />
        <meshStandardMaterial color="#b0604f" />
      </mesh>
      {/* レンガの目地ライン */}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-15.63, 0.4 + i * 0.4, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[21, 0.02]} />
          <meshStandardMaterial color="#8f4a3c" />
        </mesh>
      ))}
      {/* 奥の大きな窓(街並みが透ける風) */}
      {[-11, -4.5, 2, 8.5].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.9, -10.23]}>
            <boxGeometry args={[4.6, 2.0, 0.05]} />
            <meshStandardMaterial color="#bfdbfe" emissive="#93c5fd" emissiveIntensity={0.3} />
          </mesh>
          {/* ビルのシルエット */}
          {[0, 1, 2].map((b) => (
            <mesh key={b} position={[x - 1.2 + b * 1.2, 1.5 + (b % 2) * 0.3, -10.2]}>
              <boxGeometry args={[0.5, 0.9 + (b % 2) * 0.5, 0.01]} />
              <meshStandardMaterial color="#64748b" transparent opacity={0.45} />
            </mesh>
          ))}
          <mesh position={[x, 1.9, -10.2]}>
            <boxGeometry args={[0.06, 2.0, 0.08]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        </group>
      ))}
      {/* 会社ロゴサイン(奥の壁) */}
      <Html position={[-2, 2.75, -10.2]} center distanceFactor={16} zIndexRange={[4, 0]}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded-xl bg-slate-900/90 px-4 py-1.5 text-[14px] font-black tracking-wide text-white shadow-xl">
          AIbou <span className="text-amber-400">Office</span>
        </div>
      </Html>
      {/* 壁掛けアート */}
      {[
        { x: 13, c: "#f59e0b" },
        { x: 14.2, c: "#3b82f6" },
      ].map((a, i) => (
        <mesh key={i} position={[a.x, 2.0, -10.22]}>
          <boxGeometry args={[0.8, 1.0 - i * 0.25, 0.04]} />
          <meshStandardMaterial color={a.c} />
        </mesh>
      ))}
      {/* 壁掛け時計 */}
      <group position={[5.5, 2.7, -10.22]}>
        <mesh>
          <cylinderGeometry args={[0.3, 0.3, 0.05, 24]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
        <mesh position={[0, 0.08, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.02, 0.18, 0.01]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0.06, 0, 0.03]} rotation={[Math.PI / 2, 0, Math.PI / 3]}>
          <boxGeometry args={[0.02, 0.12, 0.01]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
      </group>
      {/* 本棚と植物 */}
      <Bookshelf position={[-15.4, 0, -6]} rotY={Math.PI / 2} />
      <Bookshelf position={[-15.4, 0, 6.5]} rotY={Math.PI / 2} />
      <Plant position={[-14.6, 0, -9.2]} big />
      <Plant position={[14.2, 0, -9.2]} big />
      <Plant position={[14.4, 0, 8.5]} big />
      <Plant position={[-3.4, 0, 8.6]} />
      <Plant position={[4.6, 0, 8.6]} />
      {/* 通路ラグ */}
      <mesh position={[0.5, 0.008, 1.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 2.4]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

// ================================================================
// シーン本体
// ================================================================

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
      <DeptZone deptId="sales" />
      <DeptZone deptId="admin" />
      <DeptZone deptId="marketing" />
      <GlassMeetingRoom inMeeting={!!currentMeeting} />
      <Lounge />
      <CoffeeBar />

      {employees.map((e) => {
        const t = targets.get(e.id);
        if (!t) return null;
        return <Character key={e.id} employee={e} target={t} />;
      })}

      <OrbitControls
        target={[0, 0.4, 0]}
        maxPolarAngle={Math.PI / 2.18}
        minDistance={6}
        maxDistance={34}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

export default function Office3D() {
  return (
    <div className="h-[560px] w-full overflow-hidden rounded-3xl ring-1 ring-slate-200 shadow-sm bg-gradient-to-b from-sky-100 to-slate-100">
      <Canvas shadows camera={{ position: [1, 13, 16.5], fov: 45 }}>
        <OfficeScene />
      </Canvas>
    </div>
  );
}

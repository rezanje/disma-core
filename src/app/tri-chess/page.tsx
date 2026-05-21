"use client"

import { useState } from "react"
import { RotateCcw, Sparkles, Swords, Trophy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type PlayerId = "aurora" | "ember" | "sage"
type PieceKind = "king" | "queen" | "rook" | "knight" | "pawn"
type Coord = { q: number; r: number }
type Piece = {
  id: string
  player: PlayerId
  kind: PieceKind
}
type BoardState = Record<string, Piece>
type MoveEvent = {
  piece: Piece
  from: string
  to: string
  captured?: Piece
}

const RADIUS = 5
const HEX_SIZE = 42
const SQRT_3 = Math.sqrt(3)
const ROOK_DIRS: Coord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]
const BISHOP_DIRS: Coord[] = [
  { q: 2, r: -1 },
  { q: 1, r: 1 },
  { q: -1, r: 2 },
  { q: -2, r: 1 },
  { q: -1, r: -1 },
  { q: 1, r: -2 },
]
const KING_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS]
const KNIGHT_JUMPS: Coord[] = [
  { q: 2, r: -3 },
  { q: 3, r: -2 },
  { q: 3, r: -1 },
  { q: 1, r: -3 },
  { q: -1, r: -2 },
  { q: -2, r: -1 },
  { q: -3, r: 1 },
  { q: -3, r: 2 },
  { q: -2, r: 3 },
  { q: -1, r: 3 },
  { q: 1, r: 2 },
  { q: 2, r: 1 },
]
const PLAYER_ORDER: PlayerId[] = ["aurora", "ember", "sage"]
const PIECE_LABEL: Record<PieceKind, string> = {
  king: "K",
  queen: "Q",
  rook: "R",
  knight: "N",
  pawn: "P",
}
const PIECE_NAME: Record<PieceKind, string> = {
  king: "King",
  queen: "Queen",
  rook: "Rook",
  knight: "Knight",
  pawn: "Pawn",
}
const PLAYERS: Record<
  PlayerId,
  {
    name: string
    accent: string
    glow: string
    fill: string
    pawnDir: Coord
    tagline: string
  }
> = {
  aurora: {
    name: "Aurora",
    accent: "#06b6d4",
    glow: "shadow-cyan-300/40",
    fill: "from-cyan-300 to-sky-500",
    pawnDir: { q: 0, r: 1 },
    tagline: "north glass",
  },
  ember: {
    name: "Ember",
    accent: "#f97316",
    glow: "shadow-orange-300/40",
    fill: "from-orange-300 to-rose-500",
    pawnDir: { q: -1, r: 0 },
    tagline: "east flame",
  },
  sage: {
    name: "Sage",
    accent: "#10b981",
    glow: "shadow-emerald-300/40",
    fill: "from-emerald-300 to-teal-600",
    pawnDir: { q: 1, r: -1 },
    tagline: "south bloom",
  },
}

const cells = makeCells()
const cellKeys = new Set(cells.map(coordKey))
const boardBounds = makeBoardBounds(cells)

function coordKey(coord: Coord) {
  return `${coord.q},${coord.r}`
}

function parseKey(key: string): Coord {
  const [q, r] = key.split(",").map(Number)
  return { q, r }
}

function addCoord(a: Coord, b: Coord, multiplier = 1): Coord {
  return { q: a.q + b.q * multiplier, r: a.r + b.r * multiplier }
}

function isInside(coord: Coord) {
  return cellKeys.has(coordKey(coord))
}

function makeCells() {
  const generated: Coord[] = []

  for (let q = -RADIUS; q <= RADIUS; q += 1) {
    for (let r = -RADIUS; r <= RADIUS; r += 1) {
      const s = -q - r
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= RADIUS) {
        generated.push({ q, r })
      }
    }
  }

  return generated
}

function hexCenter({ q, r }: Coord) {
  return {
    x: HEX_SIZE * SQRT_3 * (q + r / 2),
    y: HEX_SIZE * 1.5 * r,
  }
}

function hexPoints(center: { x: number; y: number }) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 30)
    const x = center.x + HEX_SIZE * Math.cos(angle)
    const y = center.y + HEX_SIZE * Math.sin(angle)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
}

function makeBoardBounds(boardCells: Coord[]) {
  const centers = boardCells.map(hexCenter)
  const xs = centers.map((center) => center.x)
  const ys = centers.map((center) => center.y)
  const pad = HEX_SIZE * 1.4
  const minX = Math.min(...xs) - pad
  const maxX = Math.max(...xs) + pad
  const minY = Math.min(...ys) - pad
  const maxY = Math.max(...ys) + pad

  return {
    viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
  }
}

function placePieces(board: BoardState, player: PlayerId, coords: Coord[], pieces: PieceKind[]) {
  coords.forEach((coord, index) => {
    board[coordKey(coord)] = {
      id: `${player}-${pieces[index]}-${index}`,
      player,
      kind: pieces[index],
    }
  })
}

function createInitialBoard(): BoardState {
  const board: BoardState = {}
  const backLine: PieceKind[] = ["rook", "knight", "king", "queen"]
  const pawnLine: PieceKind[] = ["pawn", "pawn", "pawn", "pawn", "pawn"]

  placePieces(
    board,
    "aurora",
    [
      { q: 1, r: -5 },
      { q: 2, r: -5 },
      { q: 3, r: -5 },
      { q: 4, r: -5 },
    ],
    backLine
  )
  placePieces(
    board,
    "aurora",
    [
      { q: 0, r: -4 },
      { q: 1, r: -4 },
      { q: 2, r: -4 },
      { q: 3, r: -4 },
      { q: 4, r: -4 },
    ],
    pawnLine
  )

  placePieces(
    board,
    "ember",
    [
      { q: 5, r: -4 },
      { q: 5, r: -3 },
      { q: 5, r: -2 },
      { q: 5, r: -1 },
    ],
    backLine
  )
  placePieces(
    board,
    "ember",
    [
      { q: 4, r: -3 },
      { q: 4, r: -2 },
      { q: 4, r: -1 },
      { q: 4, r: 0 },
      { q: 4, r: 1 },
    ],
    pawnLine
  )

  placePieces(
    board,
    "sage",
    [
      { q: -4, r: -1 },
      { q: -3, r: -2 },
      { q: -2, r: -3 },
      { q: -1, r: -4 },
    ],
    backLine
  )
  placePieces(
    board,
    "sage",
    [
      { q: -5, r: 1 },
      { q: -4, r: 0 },
      { q: -3, r: -1 },
      { q: -2, r: -2 },
      { q: -1, r: -3 },
    ],
    pawnLine
  )

  return board
}

function slideMoves(from: Coord, piece: Piece, board: BoardState, dirs: Coord[]) {
  const moves: string[] = []

  dirs.forEach((dir) => {
    for (let step = 1; step <= RADIUS * 2; step += 1) {
      const next = addCoord(from, dir, step)
      if (!isInside(next)) break

      const key = coordKey(next)
      const occupant = board[key]
      if (!occupant) {
        moves.push(key)
        continue
      }

      if (occupant.player !== piece.player) {
        moves.push(key)
      }
      break
    }
  })

  return moves
}

function pawnMoves(from: Coord, piece: Piece, board: BoardState) {
  const player = PLAYERS[piece.player]
  const forward = addCoord(from, player.pawnDir)
  const moves: string[] = []
  const forwardKey = coordKey(forward)
  const dirIndex = ROOK_DIRS.findIndex(
    (dir) => dir.q === player.pawnDir.q && dir.r === player.pawnDir.r
  )
  const captureDirs = [
    ROOK_DIRS[(dirIndex + ROOK_DIRS.length - 1) % ROOK_DIRS.length],
    ROOK_DIRS[(dirIndex + 1) % ROOK_DIRS.length],
  ]

  if (isInside(forward) && !board[forwardKey]) {
    moves.push(forwardKey)
  }

  captureDirs.forEach((dir) => {
    const target = addCoord(from, dir)
    const key = coordKey(target)
    if (isInside(target) && board[key] && board[key].player !== piece.player) {
      moves.push(key)
    }
  })

  return moves
}

function legalMoves(fromKey: string, board: BoardState) {
  const piece = board[fromKey]
  if (!piece) return []

  const from = parseKey(fromKey)

  if (piece.kind === "rook") {
    return slideMoves(from, piece, board, ROOK_DIRS)
  }

  if (piece.kind === "queen") {
    return slideMoves(from, piece, board, KING_DIRS)
  }

  if (piece.kind === "king") {
    return KING_DIRS.map((dir) => addCoord(from, dir))
      .filter(isInside)
      .map(coordKey)
      .filter((key) => !board[key] || board[key].player !== piece.player)
  }

  if (piece.kind === "knight") {
    return KNIGHT_JUMPS.map((dir) => addCoord(from, dir))
      .filter(isInside)
      .map(coordKey)
      .filter((key) => !board[key] || board[key].player !== piece.player)
  }

  return pawnMoves(from, piece, board)
}

function nextActivePlayer(current: PlayerId, board: BoardState) {
  const livingPlayers = PLAYER_ORDER.filter((player) => hasKing(player, board))
  const currentIndex = PLAYER_ORDER.indexOf(current)

  for (let offset = 1; offset <= PLAYER_ORDER.length; offset += 1) {
    const nextPlayer = PLAYER_ORDER[(currentIndex + offset) % PLAYER_ORDER.length]
    if (livingPlayers.includes(nextPlayer)) return nextPlayer
  }

  return current
}

function hasKing(player: PlayerId, board: BoardState) {
  return Object.values(board).some((piece) => piece.player === player && piece.kind === "king")
}

function pieceCount(player: PlayerId, board: BoardState) {
  return Object.values(board).filter((piece) => piece.player === player).length
}

function formatCoord(key: string) {
  const { q, r } = parseKey(key)
  return `${q}:${r}`
}

export default function TriChessPage() {
  const [board, setBoard] = useState(createInitialBoard)
  const [turn, setTurn] = useState<PlayerId>("aurora")
  const [selected, setSelected] = useState<string | null>(null)
  const [history, setHistory] = useState<MoveEvent[]>([])
  const moves = selected ? legalMoves(selected, board) : []
  const livingPlayers = PLAYER_ORDER.filter((player) => hasKing(player, board))
  const winner = livingPlayers.length === 1 ? livingPlayers[0] : null

  function resetGame() {
    setBoard(createInitialBoard())
    setTurn("aurora")
    setSelected(null)
    setHistory([])
  }

  function handleCellClick(key: string) {
    if (winner) return

    const occupant = board[key]

    if (!selected) {
      if (occupant?.player === turn) setSelected(key)
      return
    }

    if (selected === key) {
      setSelected(null)
      return
    }

    if (occupant?.player === turn) {
      setSelected(key)
      return
    }

    if (!moves.includes(key)) return

    const movingPiece = board[selected]
    if (!movingPiece) return

    const nextBoard = { ...board }
    const captured = nextBoard[key]
    delete nextBoard[selected]
    nextBoard[key] = movingPiece

    setBoard(nextBoard)
    setSelected(null)
    setTurn(nextActivePlayer(turn, nextBoard))
    setHistory((events) =>
      [
        {
          piece: movingPiece,
          from: selected,
          to: key,
          captured,
        },
        ...events,
      ].slice(0, 5)
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#eef8f6] px-4 py-6 text-slate-950 sm:px-6 lg:px-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_10%_10%,rgba(34,211,238,0.35),transparent_34%),radial-gradient(circle_at_78%_18%,rgba(251,146,60,0.28),transparent_28%),radial-gradient(circle_at_45%_88%,rgba(16,185,129,0.28),transparent_32%)]" />
      <div className="absolute left-1/2 top-12 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-white/45 blur-3xl" />
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="glass-panel relative overflow-hidden px-6 py-6 sm:px-8">
          <div className="absolute right-8 top-6 hidden h-28 w-28 rounded-[2rem] border border-white/60 bg-white/25 shadow-2xl shadow-cyan-200/30 backdrop-blur-2xl lg:block" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-600 backdrop-blur-xl">
                <Sparkles className="size-4 text-cyan-500" />
                tri-chess liquid arena
              </div>
              <h1 className="text-4xl font-black tracking-[-0.08em] text-slate-950 sm:text-6xl">
                Catur mini 3 pemain, satu papan hex.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Pilih pasukan yang sedang giliran, gerakkan piece yang menyala, dan jatuhkan king
                lawan. Rules dibuat ringkas agar cepat dimainkan: rook slide 6 arah, queen slide 12
                arah, knight lompat, pawn maju sesuai arah markasnya.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-white/60 bg-white/50 px-5 py-3 text-sm font-bold shadow-xl shadow-slate-200/60 backdrop-blur-2xl">
                Turn:{" "}
                <span style={{ color: PLAYERS[turn].accent }}>
                  {winner ? `${PLAYERS[winner].name} wins` : PLAYERS[turn].name}
                </span>
              </div>
              <Button
                className="h-12 rounded-full bg-slate-950 px-5 text-white shadow-2xl shadow-slate-400/40 hover:bg-slate-800"
                onClick={resetGame}
              >
                <RotateCcw className="mr-2 size-4" />
                Reset
              </Button>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="glass-panel relative min-h-[620px] overflow-hidden p-3 sm:p-6">
            <div className="absolute left-8 top-8 h-24 w-24 rounded-full bg-cyan-300/20 blur-2xl" />
            <div className="absolute bottom-10 right-12 h-32 w-32 rounded-full bg-emerald-300/20 blur-2xl" />
            <svg
              className="relative z-10 h-[68vh] min-h-[560px] w-full drop-shadow-[0_35px_60px_rgba(15,23,42,0.16)]"
              role="img"
              viewBox={boardBounds.viewBox}
            >
              <defs>
                <linearGradient id="cellGlass" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.86)" />
                  <stop offset="100%" stopColor="rgba(226,246,244,0.56)" />
                </linearGradient>
                <filter id="pieceGlow" x="-60%" y="-60%" width="220%" height="220%">
                  <feDropShadow dx="0" dy="12" floodColor="#0f172a" floodOpacity="0.18" stdDeviation="10" />
                </filter>
              </defs>

              {cells.map((cell) => {
                const key = coordKey(cell)
                const center = hexCenter(cell)
                const piece = board[key]
                const isSelected = selected === key
                const isMove = moves.includes(key)
                const isCapture = isMove && Boolean(piece && piece.player !== turn)

                return (
                  <g
                    className="cursor-pointer outline-none"
                    key={key}
                    onClick={() => handleCellClick(key)}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") handleCellClick(key)
                    }}
                  >
                    <polygon
                      points={hexPoints(center)}
                      fill={isSelected ? "rgba(15,23,42,0.88)" : "url(#cellGlass)"}
                      stroke={
                        isCapture
                          ? "#fb7185"
                          : isMove
                            ? "#38bdf8"
                            : "rgba(255,255,255,0.74)"
                      }
                      strokeWidth={isSelected || isMove ? 4 : 1.4}
                    />
                    <polygon
                      points={hexPoints({ x: center.x, y: center.y - 1 })}
                      fill="transparent"
                      stroke="rgba(255,255,255,0.36)"
                      strokeWidth="1"
                      transform={`scale(.86) translate(${center.x * 0.16} ${center.y * 0.16})`}
                    />
                    {isMove ? (
                      <circle
                        cx={center.x}
                        cy={center.y}
                        fill={isCapture ? "rgba(251,113,133,0.22)" : "rgba(56,189,248,0.22)"}
                        r={isCapture ? 24 : 13}
                        stroke={isCapture ? "#fb7185" : "#38bdf8"}
                        strokeDasharray={isCapture ? "6 5" : "0"}
                        strokeWidth="3"
                      />
                    ) : null}
                    {piece ? (
                      <g filter="url(#pieceGlow)">
                        <circle
                          cx={center.x}
                          cy={center.y}
                          fill={PLAYERS[piece.player].accent}
                          opacity="0.98"
                          r="25"
                        />
                        <circle
                          cx={center.x - 7}
                          cy={center.y - 8}
                          fill="rgba(255,255,255,0.34)"
                          r="8"
                        />
                        <text
                          dominantBaseline="middle"
                          fill="white"
                          fontSize={piece.kind === "pawn" ? 22 : 24}
                          fontWeight="900"
                          letterSpacing="-1"
                          textAnchor="middle"
                          x={center.x}
                          y={center.y + 2}
                        >
                          {PIECE_LABEL[piece.kind]}
                        </text>
                      </g>
                    ) : null}
                  </g>
                )
              })}
            </svg>
          </div>

          <aside className="flex flex-col gap-4">
            {winner ? (
              <div className="liquid-card border-white/70 bg-white/55 p-5">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "grid size-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-xl",
                      PLAYERS[winner].fill,
                      PLAYERS[winner].glow
                    )}
                  >
                    <Trophy className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                      winner
                    </p>
                    <h2 className="text-2xl font-black tracking-[-0.04em]">
                      {PLAYERS[winner].name}
                    </h2>
                  </div>
                </div>
              </div>
            ) : null}

            {PLAYER_ORDER.map((player) => {
              const active = turn === player && !winner
              const alive = hasKing(player, board)

              return (
                <div
                  className={cn(
                    "rounded-[2rem] border p-5 shadow-2xl backdrop-blur-2xl transition-all",
                    active
                      ? "border-white/80 bg-white/70 shadow-slate-300/40"
                      : "border-white/45 bg-white/35 shadow-slate-200/20",
                    !alive && "opacity-45"
                  )}
                  key={player}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "grid size-11 place-items-center rounded-2xl bg-gradient-to-br text-sm font-black text-white shadow-xl",
                          PLAYERS[player].fill,
                          PLAYERS[player].glow
                        )}
                      >
                        {PLAYERS[player].name.slice(0, 1)}
                      </div>
                      <div>
                        <h3 className="text-lg font-black tracking-[-0.04em]">
                          {PLAYERS[player].name}
                        </h3>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          {PLAYERS[player].tagline}
                        </p>
                      </div>
                    </div>
                    {active ? (
                      <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
                        live
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white/45 p-3">
                      <p className="text-xs font-semibold text-slate-500">Pieces</p>
                      <p className="text-xl font-black">{pieceCount(player, board)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/45 p-3">
                      <p className="text-xs font-semibold text-slate-500">King</p>
                      <p className="text-xl font-black">{alive ? "Safe" : "Out"}</p>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="rounded-[2rem] border border-white/50 bg-white/35 p-5 shadow-2xl shadow-slate-200/20 backdrop-blur-2xl">
              <div className="mb-4 flex items-center gap-2">
                <Swords className="size-5 text-slate-700" />
                <h2 className="text-lg font-black tracking-[-0.04em]">Move log</h2>
              </div>
              {history.length ? (
                <div className="space-y-3">
                  {history.map((event, index) => (
                    <div className="rounded-2xl bg-white/45 p-3 text-sm" key={`${event.to}-${index}`}>
                      <p className="font-bold text-slate-800">
                        {PLAYERS[event.piece.player].name} {PIECE_NAME[event.piece.kind]}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatCoord(event.from)} to {formatCoord(event.to)}
                        {event.captured
                          ? `, captured ${PLAYERS[event.captured.player].name} ${
                              PIECE_NAME[event.captured.kind]
                            }`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-white/45 p-4 text-sm leading-6 text-slate-500">
                  Belum ada langkah. Klik piece milik pemain aktif, lalu pilih hex yang menyala.
                </p>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

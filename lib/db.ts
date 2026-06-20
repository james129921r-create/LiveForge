import { PrismaClient } from '@prisma/client'

// ─── Singleton Prisma Client ─────────────────────────────────────────────────
// Next.js dev mode hot-reloads modules, creating new PrismaClient instances
// each time. This singleton pattern prevents connection pool exhaustion by
// reusing the same client across hot reloads.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// ─── Workspace Helpers ────────────────────────────────────────────────────────

export async function getWorkspaceById(id: string) {
  return db.workspace.findUnique({
    where: { id },
    include: { folder: true },
  })
}

export async function getWorkspacesByFolder(folderId: string) {
  return db.workspace.findMany({
    where: { folderId },
    orderBy: { lastLoadedAt: { sort: 'desc', nulls: 'last' } },
  })
}

export async function getSharedWorkspace(shareId: string) {
  return db.workspace.findUnique({
    where: { shareId },
  })
}

// ─── Favorite Helpers ─────────────────────────────────────────────────────────

export async function saveFavorite(channelSlug: string, userId?: string) {
  return db.favorite.upsert({
    where: {
      userId_channelSlug: {
        userId: userId ?? 'anonymous',
        channelSlug,
      },
    },
    update: {},
    create: {
      userId: userId ?? 'anonymous',
      channelSlug,
    },
  })
}

export async function getFavorites(userId?: string) {
  return db.favorite.findMany({
    where: { userId: userId ?? 'anonymous' },
    orderBy: { addedAt: 'desc' },
  })
}

export async function removeFavorite(id: string) {
  return db.favorite.delete({
    where: { id },
  })
}

// ─── Clip Helpers ─────────────────────────────────────────────────────────────

interface ClipCreateData {
  userId?: string
  channelName: string
  channelSlug: string
  startTime: Date
  endTime: Date
  duration: number
  thumbnailUrl?: string
  title?: string
  tags?: string
}

export async function saveClip(data: ClipCreateData) {
  return db.clip.create({
    data,
  })
}

export async function getClips(userId?: string) {
  return db.clip.findMany({
    where: { userId: userId ?? 'anonymous' },
    orderBy: { createdAt: 'desc' },
  })
}

export async function removeClip(id: string) {
  return db.clip.delete({
    where: { id },
  })
}

// ─── Search History Helpers ───────────────────────────────────────────────────

export async function saveSearchHistory(query: string, resultCount?: number, userId?: string) {
  return db.searchHistory.create({
    data: {
      userId: userId ?? 'anonymous',
      query,
      resultCount,
    },
  })
}

export async function getSearchHistory(limit = 20, userId?: string) {
  return db.searchHistory.findMany({
    where: { userId: userId ?? 'anonymous' },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
  })
}

import { defineStore } from 'pinia'
import { read, write } from '@/utils/storage'
import { uid } from '@/utils/id'
import { toDateKey, diffDays } from '@/utils/date'

const MOVEMENTS_KEY = 'ingredient-movements'
const MIGRATE_KEY = 'usage-migrated-v1'

// 出入库流水：{ id, type: purchase|consume|discard, name, unit, category, quantity, date(YYYY-MM-DD), batchId }

// 首次升级时，把旧的采购历史回填为采购流水（旧数据没有类别，统一归为“其他”）
function migrateFromShoppingHistory() {
  if (read(MIGRATE_KEY, false)) return null

  const existing = read(MOVEMENTS_KEY, [])
  if (!existing.length) {
    const history = read('shopping-history', [])
    const movements = []
    history.forEach((h) => {
      const dateKey = (h.date || new Date().toISOString()).slice(0, 10)
      ;(h.items || []).forEach((it) => {
        movements.push({
          id: uid('mov'),
          type: 'purchase',
          name: it.name,
          unit: it.unit,
          category: '其他',
          quantity: Number(it.quantity) || 0,
          date: dateKey,
          batchId: h.id,
        })
      })
    })
    write(MOVEMENTS_KEY, movements)
    write(MIGRATE_KEY, true)
    return movements
  }
  write(MIGRATE_KEY, true)
  return null
}

const RANGE_DAYS = { 30: 30, 90: 90, 365: 365 }

// 各区间判定“高频刚需”的最少采购次数
const STAPLE_MIN_BUYS = { 30: 3, 90: 4, 365: 6, all: 3 }
// “该少囤”的浪费率阈值（丢弃量 / 采购量）
const OVERBUY_WASTE_RATE = 0.25

export const useUsageStore = defineStore('usage', {
  state: () => ({
    movements: migrateFromShoppingHistory() || read(MOVEMENTS_KEY, []),
  }),

  getters: {
    // 过滤出区间内的流水
    movementsInRange: (state) => (range = 30) => {
      const all = state.movements
      if (range === 'all') return all
      const days = RANGE_DAYS[range] || 30
      const today = toDateKey()
      return all.filter((m) => diffDays(m.date, today) < days)
    },

    // 区间覆盖天数（用于计算日均消耗）
    periodDays: (state) => (range = 30) => {
      if (range !== 'all') return RANGE_DAYS[range] || 30
      if (!state.movements.length) return 1
      const earliest = state.movements.reduce(
        (min, m) => (m.date < min ? m.date : min),
        state.movements[0].date,
      )
      return Math.max(1, diffDays(earliest) + 1)
    },

    // 按食材聚合的消耗分析
    ingredientStats() {
      return (range = 30) => {
        const rows = this.movementsInRange(range)
        const days = this.periodDays(range)
        const map = new Map()

        const ensure = (m) => {
          const key = `${m.name}${m.unit}`
          if (!map.has(key)) {
            map.set(key, {
              key,
              name: m.name,
              unit: m.unit,
              category: m.category || '其他',
              purchaseCount: 0,
              purchasedQty: 0,
              consumedQty: 0,
              discardedQty: 0,
              batches: new Set(),
              purchaseDates: [],
            })
          }
          return map.get(key)
        }

        rows.forEach((m) => {
          const r = ensure(m)
          r.category = m.category || r.category
          const qty = Number(m.quantity) || 0
          if (m.type === 'purchase') {
            r.purchaseCount += 1
            r.purchasedQty += qty
            r.batches.add(m.batchId || m.id)
            if (!r.purchaseDates.includes(m.date)) r.purchaseDates.push(m.date)
          } else if (m.type === 'consume') {
            r.consumedQty += qty
          } else if (m.type === 'discard') {
            r.discardedQty += qty
          }
        })

        const minBuys = STAPLE_MIN_BUYS[range] ?? 3

        return [...map.values()]
          .map((r) => {
            // 采购次数按采购批次计（同一批采购入库只算一次）
            r.purchaseCount = r.batches.size
            r.purchaseDates.sort()
            // 平均采购间隔（天）
            r.avgInterval = 0
            if (r.purchaseDates.length > 1) {
              const span = diffDays(r.purchaseDates[0], r.purchaseDates[r.purchaseDates.length - 1])
              r.avgInterval = span / (r.purchaseDates.length - 1)
            }
            r.consumedPerDay = days ? r.consumedQty / days : 0
            r.consumeRatio = r.purchasedQty ? r.consumedQty / r.purchasedQty : 0
            r.wasteRate = r.purchasedQty ? r.discardedQty / r.purchasedQty : 0
            r.netAdded = r.purchasedQty - r.consumedQty - r.discardedQty

            const tags = []
            if (r.purchaseCount >= minBuys && r.consumeRatio >= 0.6) tags.push('staple')
            if (r.purchasedQty > 0 && r.wasteRate >= OVERBUY_WASTE_RATE) tags.push('overbuy')
            else if (r.purchaseCount >= 2 && r.consumeRatio < 0.4 && r.netAdded > 0) tags.push('overstock')
            r.tags = tags
            return r
          })
      }
    },

    // 最常买 TOP N（按采购批次数）
    mostBought() {
      return (range = 30, n = 5) =>
        this.ingredientStats(range)
          .filter((r) => r.purchaseCount > 0)
          .sort((a, b) => b.purchaseCount - a.purchaseCount || b.purchasedQty - a.purchasedQty)
          .slice(0, n)
    },

    // 消耗最快 TOP N（按日均消耗量）
    fastestConsumed() {
      return (range = 30, n = 5) =>
        this.ingredientStats(range)
          .filter((r) => r.consumedQty > 0)
          .sort((a, b) => b.consumedPerDay - a.consumedPerDay || b.consumedQty - a.consumedQty)
          .slice(0, n)
    },

    // 区间概览
    summary() {
      return (range = 30) => {
        const rows = this.ingredientStats(range)
        const batchSet = new Set()
        this.movementsInRange(range)
          .filter((m) => m.type === 'purchase')
          .forEach((m) => batchSet.add(m.batchId || m.id))
        return {
          batchCount: batchSet.size,
          ingredientKinds: rows.length,
          consumedKinds: rows.filter((r) => r.consumedQty > 0).length,
          wasteKinds: rows.filter((r) => r.discardedQty > 0).length,
        }
      }
    },
  },

  actions: {
    persist() {
      write(MOVEMENTS_KEY, this.movements)
    },

    addMovement({ type, name, unit, category = '其他', quantity = 0, date, batchId }) {
      this.movements.push({
        id: uid('mov'),
        type,
        name,
        unit,
        category,
        quantity: Number(quantity) || 0,
        date: (date || new Date().toISOString()).slice(0, 10),
        batchId,
      })
      this.persist()
    },
  },
})

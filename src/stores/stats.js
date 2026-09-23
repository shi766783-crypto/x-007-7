import { defineStore } from 'pinia'
import { useInventoryStore } from './inventory'
import { useMealPlanStore } from './mealPlan'
import { useDietRecordStore } from './dietRecord'
import { useShoppingListStore } from './shoppingList'
import { useUserStore } from './user'
import { weekDateKeys } from '@/utils/date'
import { BOTS } from '@/data/bots'

const DAY_MS = 24 * 60 * 60 * 1000
// 榜单/标签取前几名
const TOP_N = 3
// 库存可支撑天数达到该值，视为囤货偏多
const STOCK_HEAVY_DAYS = 14

export const useStatsStore = defineStore('stats', {
  getters: {
    // 本周计划完成率 = 本周已记录餐次 / 本周已计划餐次
    weekCompletionRate() {
      const mealPlan = useMealPlanStore()
      const diet = useDietRecordStore()
      const planned = mealPlan.plannedMeals
      if (!planned) return 0
      const weekSet = new Set(weekDateKeys())
      const recorded = diet.records.filter((r) => weekSet.has(r.date)).length
      return Math.min(100, Math.round((recorded / planned) * 100))
    },

    // 食材浪费率 = 过期数量 / 采购总量
    wasteRate() {
      const inventory = useInventoryStore()
      const total = inventory.items.length
      if (!total) return 0
      return inventory.expiredItems.length / total
    },

    expiredCount: () => useInventoryStore().expiredItems.length,
    inventoryCount: () => useInventoryStore().items.length,

    totalSpend: () => useShoppingListStore().totalSpend,
    weeklySpend: () => useShoppingListStore().weeklySpend,

    nutritionTrend: () => useDietRecordStore().nutritionTrend(7),
    avgNutritionThisWeek: () => useDietRecordStore().avgNutritionThisWeek,

    // 节约达人榜（浪费率从低到高）
    saverLeaderboard() {
      const inventory = useInventoryStore()
      const myWaste = inventory.items.length ? inventory.expiredItems.length / inventory.items.length : 0
      const rows = BOTS.map((b) => ({
        name: b.name,
        avatar: b.avatar,
        wasteRate: b.wasteRate,
        isMe: false,
      }))
      rows.push({ name: useUserStore().name, avatar: useUserStore().avatar, wasteRate: myWaste, isMe: true })
      return rows.sort((a, b) => a.wasteRate - b.wasteRate)
    },

    // 食谱创意榜（发布菜谱数量从高到低）
    recipeLeaderboard() {
      const mealPlan = useMealPlanStore()
      const rows = BOTS.map((b) => ({
        name: b.name,
        avatar: b.avatar,
        recipeCount: b.recipeCount,
        isMe: false,
      }))
      rows.push({
        name: useUserStore().name,
        avatar: useUserStore().avatar,
        recipeCount: mealPlan.totalDishes,
        isMe: true,
      })
      return rows.sort((a, b) => b.recipeCount - a.recipeCount)
    },

    // 消耗分析：按食材聚合一段时间内的采购次数与消耗量
    // days > 0 表示最近 N 天；days 为空/0 表示全部时间
    consumptionAnalysis: () => (days = 30) => {
      const inventory = useInventoryStore()
      const shopping = useShoppingListStore()

      const now = Date.now()
      const start = days > 0 ? now - Number(days) * DAY_MS : -Infinity
      const inRange = (iso) => new Date(iso).getTime() >= start
      const keyOf = (name, unit) => `${name}|${unit}`

      const rows = new Map()
      const ensure = (name, unit, category) => {
        const key = keyOf(name, unit)
        let row = rows.get(key)
        if (!row) {
          row = {
            key,
            name,
            unit,
            category: category || '其他',
            purchaseCount: 0,
            purchaseAmount: 0,
            purchaseDates: [],
            consumeCount: 0,
            consumeAmount: 0,
            consumeDates: [],
            currentStock: 0,
          }
          rows.set(key, row)
        }
        if (category && category !== '其他') row.category = category
        return row
      }

      // 采购历史：一个批次里出现该食材记一次采购
      shopping.history.forEach((h) => {
        if (!inRange(h.date)) return
        ;(h.items || []).forEach((it) => {
          const row = ensure(it.name, it.unit, it.category)
          row.purchaseCount += 1
          row.purchaseAmount += Number(it.quantity || 0)
          row.purchaseDates.push(new Date(h.date).getTime())
        })
      })

      // 消耗流水
      inventory.consumptionLog.forEach((log) => {
        if (!inRange(log.date)) return
        const row = ensure(log.name, log.unit, log.category)
        row.consumeCount += 1
        row.consumeAmount += Number(log.amount || 0)
        row.consumeDates.push(new Date(log.date).getTime())
      })

      // 用当前库存补充存量与类别（区间内无采购/消耗活动的食材不纳入分析）
      inventory.items.forEach((i) => {
        const row = rows.get(keyOf(i.name, i.unit))
        if (!row) return
        row.currentStock = Number(i.quantity || 0)
        if (i.category) row.category = i.category
      })

      const list = [...rows.values()]

      list.forEach((row) => {
        // 统计跨度（天）：固定窗口取窗口长度；全部时间取该食材最早记录到今天
        let span = days > 0 ? Number(days) : 0
        if (span <= 0) {
          const earliest = Math.min(...row.purchaseDates, ...row.consumeDates, now)
          span = Math.max(1, Math.ceil((now - earliest) / DAY_MS) + 1)
        }
        row.spanDays = span
        // 日均消耗
        row.consumeRate = span > 0 ? row.consumeAmount / span : 0
        // 平均采购间隔（天）：两次以上采购时，按首末采购时间均摊
        row.avgInterval =
          row.purchaseDates.length >= 2
            ? (Math.max(...row.purchaseDates) - Math.min(...row.purchaseDates)) /
              DAY_MS /
              (row.purchaseDates.length - 1)
            : null
        // 当前库存按日均消耗可支撑的天数（无消耗则为 null）
        row.stockDays = row.consumeRate > 0 ? row.currentStock / row.consumeRate : null
        // 消耗周转率（无量纲，跨单位可比）：窗口内消耗量 / 采购量
        // 反映“买进来用得快不快”；窗口内只消耗没补货（吃老库存）视为周转充分
        row.turnover =
          row.purchaseAmount > 0
            ? row.consumeAmount / row.purchaseAmount
            : row.consumeAmount > 0
              ? 1
              : 0
      })

      // 最常买 TOP N（至少采购 2 次才给“刚需”标签）
      const frequentKeys = new Set(
        list
          .filter((r) => r.purchaseCount >= 2)
          .sort((a, b) => b.purchaseCount - a.purchaseCount || b.purchaseAmount - a.purchaseAmount)
          .slice(0, TOP_N)
          .map((r) => r.key),
      )
      // 消耗最快 TOP N：按周转率降序（跨单位可比），其次看消耗量
      const fastKeys = new Set(
        list
          .filter((r) => r.consumeAmount > 0)
          .sort((a, b) => b.turnover - a.turnover || b.consumeAmount - a.consumeAmount)
          .slice(0, TOP_N)
          .map((r) => r.key),
      )

      list.forEach((row) => {
        row.tags = []
        if (frequentKeys.has(row.key)) row.tags.push({ text: '刚需常买', type: 'frequent' })
        if (fastKeys.has(row.key)) row.tags.push({ text: '消耗最快', type: 'fast' })
        // 买多了：库存能吃很久，或买过却几乎没消耗
        const heavy =
          row.purchaseAmount > 0 &&
          (row.consumeAmount === 0 ||
            (row.stockDays !== null && row.stockDays >= STOCK_HEAVY_DAYS))
        if (heavy) row.tags.push({ text: '建议少囤', type: 'overstock' })
        row.overstock = heavy
      })

      // 默认排序：采购次数降序，其次消耗量
      list.sort(
        (a, b) =>
          b.purchaseCount - a.purchaseCount ||
          b.consumeAmount - a.consumeAmount ||
          b.purchaseAmount - a.purchaseAmount,
      )

      return {
        days: days > 0 ? Number(days) : 0,
        rows: list,
        topFrequent: list
          .filter((r) => r.purchaseCount > 0)
          .sort((a, b) => b.purchaseCount - a.purchaseCount || b.purchaseAmount - a.purchaseAmount)
          .slice(0, TOP_N),
        topFast: list
          .filter((r) => r.consumeAmount > 0)
          .sort((a, b) => b.turnover - a.turnover || b.consumeAmount - a.consumeAmount)
          .slice(0, TOP_N),
        overstock: list
          .filter((r) => r.overstock)
          .sort((a, b) => b.currentStock - a.currentStock),
        summary: {
          purchaseKinds: list.filter((r) => r.purchaseCount > 0).length,
          consumeKinds: list.filter((r) => r.consumeAmount > 0).length,
          totalConsume: list.reduce((s, r) => s + r.consumeAmount, 0),
          overstockKinds: list.filter((r) => r.overstock).length,
        },
      }
    },
  },
})

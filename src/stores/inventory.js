import { defineStore } from 'pinia'
import { read, write } from '@/utils/storage'
import { uid } from '@/utils/id'
import { remainingDays } from '@/utils/date'
import { useUsageStore } from './usage'
import { EXPIRY_WARN_DAYS } from '@/constants'

const STORAGE_KEY = 'inventory'

function createItem(data) {
  return {
    id: uid('ing'),
    name: '',
    category: '蔬菜',
    quantity: 1,
    unit: '个',
    purchaseDate: '',
    shelfLifeDays: 7,
    location: '冷藏',
    note: '',
    photo: '',
    ...data,
  }
}

export const useInventoryStore = defineStore('inventory', {
  state: () => ({
    items: read(STORAGE_KEY, []),
  }),

  getters: {
    // 附带剩余保质期与状态的列表
    withExpiry(state) {
      const today = new Date()
      return state.items.map((item) => {
        const remain = remainingDays(item.purchaseDate, item.shelfLifeDays, today)
        let status = 'fresh'
        if (remain < 0) status = 'expired'
        else if (remain <= EXPIRY_WARN_DAYS) status = 'near'
        return { ...item, remain, status }
      })
    },
    expiredItems() {
      return this.withExpiry.filter((i) => i.status === 'expired')
    },
    nearExpiryItems() {
      return this.withExpiry.filter((i) => i.status === 'near')
    },
    freshItems() {
      return this.withExpiry.filter((i) => i.status === 'fresh')
    },
    // 按类别统计
    byCategory() {
      const map = {}
      this.items.forEach((i) => {
        map[i.category] = (map[i.category] || 0) + 1
      })
      return map
    },
    totalQuantity() {
      return this.items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)
    },
  },

  actions: {
    persist() {
      write(STORAGE_KEY, this.items)
    },

    // 记录一条出入库流水（在动作执行时才取 store 实例，规避模块循环依赖）
    logMovement(entry) {
      try {
        useUsageStore().addMovement(entry)
      } catch (e) {
        // usage store 尚未初始化（如 SSR/测试环境）时不影响库存操作
      }
    },

    addItem(data) {
      const item = this._createItem(data)
      // 手动添加视为一次采购入库
      this.logMovement({
        type: 'purchase',
        name: item.name,
        unit: item.unit,
        category: item.category,
        quantity: Number(item.quantity) || 0,
        date: item.purchaseDate,
      })
      return item
    },

    // 内部：仅创建入库，不记流水（由调用方决定如何记账）
    _createItem(data) {
      const item = createItem(data)
      this.items.unshift(item)
      this.persist()
      return item
    },

    updateItem(id, patch) {
      const idx = this.items.findIndex((i) => i.id === id)
      if (idx === -1) return
      this.items[idx] = { ...this.items[idx], ...patch }
      this.persist()
    },

    // 从库存中移除；silent 为 true 时不记丢弃流水（由消耗等动作自行记账）
    _remove(id, silent = false) {
      const item = this.items.find((i) => i.id === id)
      if (!item) return
      this.items = this.items.filter((i) => i.id !== id)
      this.persist()
      if (!silent) {
        // 直接删除视为丢弃（过期/变质/闲置清理）
        this.logMovement({
          type: 'discard',
          name: item.name,
          unit: item.unit,
          category: item.category,
          quantity: Number(item.quantity) || 0,
        })
      }
    },

    removeItem(id) {
      this._remove(id, false)
    },

    // 消耗食材（减少数量，归零则删除）
    consume(id, amount = 1) {
      const item = this.items.find((i) => i.id === id)
      if (!item) return
      const used = Math.min(Number(item.quantity), Number(amount))
      const next = Number(item.quantity) - Number(amount)
      if (next <= 0) this._remove(id, true)
      else this.updateItem(id, { quantity: next })
      this.logMovement({
        type: 'consume',
        name: item.name,
        unit: item.unit,
        category: item.category,
        quantity: used,
      })
    },

    // 入库（增加数量），不存在则新建
    restock({ name, unit, quantity, category = '其他', location = '常温', shelfLifeDays = 7, date, batchId }) {
      const exist = this.items.find(
        (i) => i.name === name && i.unit === unit,
      )
      if (exist) {
        this.updateItem(exist.id, { quantity: Number(exist.quantity) + Number(quantity) })
      } else {
        this._createItem({
          name,
          unit,
          quantity,
          category,
          location,
          shelfLifeDays,
          purchaseDate: (date || new Date().toISOString()).slice(0, 10),
        })
      }
      this.logMovement({
        type: 'purchase',
        name,
        unit,
        category,
        quantity: Number(quantity) || 0,
        date: (date || new Date().toISOString()).slice(0, 10),
        batchId,
      })
    },

    // 通过名称/单位查找库存（用于采购缺口对比）
    findByRef(ref) {
      if (ref.ingredientId) {
        const byId = this.items.find((i) => i.id === ref.ingredientId)
        if (byId) return byId
      }
      return this.items.find((i) => i.name === ref.name && i.unit === ref.unit)
    },
  },
})

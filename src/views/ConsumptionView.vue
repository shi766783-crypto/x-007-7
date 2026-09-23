<script setup>
import { ref, computed } from 'vue'
import { useStatsStore } from '@/stores/stats'
import { CATEGORY_ICONS, CATEGORY_COLORS } from '@/constants'
import StatCard from '@/components/common/StatCard.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'

const stats = useStatsStore()

const ranges = [
  { label: '近 7 天', days: 7 },
  { label: '近 30 天', days: 30 },
  { label: '近 90 天', days: 90 },
  { label: '全部', days: 0 },
]
const activeDays = ref(30)

const analysis = computed(() => stats.consumptionAnalysis(activeDays.value))

const sorts = [
  { key: 'purchase', label: '采购次数' },
  { key: 'consume', label: '消耗量' },
  { key: 'turnover', label: '周转率' },
  { key: 'stock', label: '库存量' },
]
const activeSort = ref('purchase')

const sortedRows = computed(() => {
  const rows = [...analysis.value.rows]
  switch (activeSort.value) {
    case 'consume':
      rows.sort((a, b) => b.consumeAmount - a.consumeAmount)
      break
    case 'turnover':
      rows.sort((a, b) => b.turnover - a.turnover || b.consumeAmount - a.consumeAmount)
      break
    case 'stock':
      rows.sort((a, b) => b.currentStock - a.currentStock)
      break
    default:
      rows.sort(
        (a, b) =>
          b.purchaseCount - a.purchaseCount ||
          b.consumeAmount - a.consumeAmount ||
          b.purchaseAmount - a.purchaseAmount,
      )
  }
  return rows
})

// 条形图归一化（同列内部相对比例）
function pct(value, max) {
  if (!max) return 0
  return Math.round((value / max) * 100)
}

const maxPurchase = computed(() => Math.max(...analysis.value.rows.map((r) => r.purchaseCount), 0))
const maxConsume = computed(() => Math.max(...analysis.value.rows.map((r) => r.consumeAmount), 0))

function fmtNum(n) {
  return Number(n).toFixed(1).replace(/\.0$/, '')
}

function tagStyle(type) {
  const map = {
    frequent: { bg: '#e8f5e9', color: '#388e3c' },
    fast: { bg: '#e3f2fd', color: '#1976d2' },
    overstock: { bg: '#fff3e0', color: '#ef6c00' },
  }
  return map[type] || { bg: '#f0f2f5', color: '#646a73' }
}

const rankMedals = ['🥇', '🥈', '🥉']

const isEmpty = computed(() => analysis.value.rows.length === 0)
</script>

<template>
  <div>
    <div class="page-head">
      <h2>📈 消耗分析</h2>
      <div class="range-tabs">
        <button
          v-for="r in ranges"
          :key="r.days"
          class="chip"
          :class="{ on: activeDays === r.days }"
          @click="activeDays = r.days"
        >
          {{ r.label }}
        </button>
      </div>
    </div>
    <p class="muted hint">按食材统计这段时间买了几次、用了多少，一眼看出哪些是刚需、哪些买多了。</p>

    <BaseEmpty
      v-if="isEmpty"
      emoji="🧾"
      text="这段时间还没有采购或消耗记录。去采购清单标记入库、在食材库存里点「消耗」，数据会自动汇总到这里。"
    />

    <template v-else>
      <div class="grid grid-4">
        <StatCard
          label="采购过的食材"
          :value="analysis.summary.purchaseKinds"
          suffix="种"
          icon="🛒"
          color="#4caf50"
        />
        <StatCard
          label="消耗过的食材"
          :value="analysis.summary.consumeKinds"
          suffix="种"
          icon="🍳"
          color="#2196f3"
        />
        <StatCard
          label="建议少囤的食材"
          :value="analysis.summary.overstockKinds"
          suffix="种"
          icon="📦"
          color="#ff9800"
        />
        <StatCard
          label="涉及食材种类"
          :value="analysis.rows.length"
          suffix="种"
          icon="🥬"
          color="#7e57c2"
        />
      </div>

      <div class="grid grid-3">
        <!-- 最常买 -->
        <div class="card">
          <div class="section-title">🔥 最常买 TOP3</div>
          <BaseEmpty v-if="!analysis.topFrequent.length" emoji="🛒" text="暂无采购记录" />
          <div v-else class="rank-list">
            <div v-for="(r, i) in analysis.topFrequent" :key="'f' + r.key" class="rank-item">
              <span class="medal">{{ rankMedals[i] }}</span>
              <span class="r-emoji">{{ CATEGORY_ICONS[r.category] }}</span>
              <div class="r-info">
                <div class="r-name">{{ r.name }}</div>
                <div class="muted small">买了 {{ r.purchaseCount }} 次</div>
              </div>
              <span class="r-badge frequent">刚需</span>
            </div>
          </div>
        </div>

        <!-- 消耗最快 -->
        <div class="card">
          <div class="section-title">⚡ 消耗最快 TOP3</div>
          <BaseEmpty v-if="!analysis.topFast.length" emoji="🍳" text="暂无消耗记录" />
          <div v-else class="rank-list">
            <div v-for="(r, i) in analysis.topFast" :key="'q' + r.key" class="rank-item">
              <span class="medal">{{ rankMedals[i] }}</span>
              <span class="r-emoji">{{ CATEGORY_ICONS[r.category] }}</span>
              <div class="r-info">
                <div class="r-name">{{ r.name }}</div>
                <div class="muted small">周转 {{ Math.round(r.turnover * 100) }}% · 日均 {{ fmtNum(r.consumeRate) }}{{ r.unit }}</div>
              </div>
              <span class="r-badge fast">耗得快</span>
            </div>
          </div>
        </div>

        <!-- 建议少囤 -->
        <div class="card">
          <div class="section-title">🧺 建议少囤</div>
          <BaseEmpty v-if="!analysis.overstock.length" emoji="✅" text="库存周转健康，没有囤多" />
          <div v-else class="rank-list">
            <div v-for="r in analysis.overstock.slice(0, 3)" :key="'o' + r.key" class="rank-item">
              <span class="r-emoji static">{{ CATEGORY_ICONS[r.category] }}</span>
              <div class="r-info">
                <div class="r-name">{{ r.name }}</div>
                <div class="muted small">
                  库存 {{ fmtNum(r.currentStock) }}{{ r.unit
                  }}<template v-if="r.stockDays !== null"> · 约吃 {{ fmtNum(r.stockDays) }} 天</template>
                </div>
              </div>
              <span class="r-badge overstock">少囤</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="section-title">
          <span>📋 食材明细</span>
          <div class="sort-tabs">
            <button
              v-for="s in sorts"
              :key="s.key"
              class="chip sm"
              :class="{ on: activeSort === s.key }"
              @click="activeSort = s.key"
            >
              {{ s.label }}
            </button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="ana-table">
            <thead>
              <tr>
                <th class="col-name">食材</th>
                <th class="num">采购次数</th>
                <th class="num">采购量</th>
                <th class="num">消耗量</th>
                <th class="num">周转率</th>
                <th class="num">当前库存</th>
                <th>判断</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in sortedRows" :key="r.key">
                <td>
                  <div class="ing-cell">
                    <span
                      class="cat-dot"
                      :style="{ background: CATEGORY_COLORS[r.category] || '#90a4ae' }"
                    ></span>
                    <span class="ing-name">{{ r.name }}</span>
                  </div>
                </td>
                <td class="num">
                  <div class="bar-cell">
                    <div class="bar-track">
                      <div
                        class="bar-fill green"
                        :style="{ width: pct(r.purchaseCount, maxPurchase) + '%' }"
                      ></div>
                    </div>
                    <span class="bar-val">{{ r.purchaseCount }} 次</span>
                  </div>
                </td>
                <td class="num">{{ fmtNum(r.purchaseAmount) }} {{ r.unit }}</td>
                <td class="num">
                  <div class="bar-cell">
                    <div class="bar-track">
                      <div
                        class="bar-fill blue"
                        :style="{ width: pct(r.consumeAmount, maxConsume) + '%' }"
                      ></div>
                    </div>
                    <span class="bar-val">{{ fmtNum(r.consumeAmount) }} {{ r.unit }}</span>
                  </div>
                </td>
                <td class="num">
                  <div class="turn-num" :class="{ high: r.turnover >= 0.8, low: r.turnover === 0 }">
                    {{ Math.round(r.turnover * 100) }}%
                  </div>
                  <div class="muted small">日均 {{ fmtNum(r.consumeRate) }} {{ r.unit }}</div>
                </td>
                <td class="num">{{ fmtNum(r.currentStock) }} {{ r.unit }}</td>
                <td>
                  <div class="tags">
                    <span
                      v-for="t in r.tags"
                      :key="t.type"
                      class="ana-tag"
                      :style="{ background: tagStyle(t.type).bg, color: tagStyle(t.type).color }"
                    >
                      {{ t.text }}
                    </span>
                    <span v-if="!r.tags.length" class="muted small">—</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted small foot-note">
          周转率 = 窗口内消耗量 ÷ 采购量，越高说明买进来用得越快（跨单位可比）；「建议少囤」= 买过但几乎没消耗，或当前库存按日均消耗约能吃 14 天以上。
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.page-head h2 {
  margin: 0;
}
.hint {
  margin: 0 0 16px;
}
.range-tabs,
.sort-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.chip {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 16px;
  padding: 5px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text);
}
.chip.sm {
  padding: 3px 10px;
  font-size: 12px;
}
.chip.on {
  background: var(--primary-light);
  border-color: var(--primary);
  color: var(--primary-dark);
  font-weight: 600;
}
.grid {
  margin-bottom: 16px;
}
.rank-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rank-item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.medal {
  font-size: 18px;
  width: 22px;
  text-align: center;
  flex-shrink: 0;
}
.r-emoji {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}
.r-emoji.static {
  margin-left: 22px;
}
.r-info {
  flex: 1;
  min-width: 0;
}
.r-name {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.small {
  font-size: 12px;
}
.r-badge,
.ana-tag {
  font-size: 12px;
  padding: 2px 9px;
  border-radius: 11px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}
.r-badge.frequent {
  background: #e8f5e9;
  color: #388e3c;
}
.r-badge.fast {
  background: #e3f2fd;
  color: #1976d2;
}
.r-badge.overstock {
  background: #fff3e0;
  color: #ef6c00;
}
.table-wrap {
  overflow-x: auto;
}
.ana-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 720px;
}
.ana-table th,
.ana-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.ana-table th {
  color: var(--text-2);
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
}
.ana-table tbody tr:last-child td {
  border-bottom: none;
}
.ana-table .num {
  text-align: right;
  white-space: nowrap;
}
.col-name {
  min-width: 110px;
}
.ing-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ing-name {
  font-weight: 600;
}
.bar-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}
.bar-track {
  width: 64px;
  height: 8px;
  background: var(--surface-2);
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}
.bar-fill {
  height: 100%;
  border-radius: 4px;
  min-width: 2px;
}
.bar-fill.green {
  background: #66bb6a;
}
.bar-fill.blue {
  background: #42a5f5;
}
.bar-val {
  min-width: 42px;
  text-align: right;
}
.turn-num {
  font-weight: 600;
  line-height: 1.3;
}
.turn-num.high {
  color: #1976d2;
}
.turn-num.low {
  color: var(--text-2);
}
.tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.foot-note {
  margin: 12px 0 0;
}
</style>

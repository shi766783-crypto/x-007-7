<script setup>
import { ref, computed } from 'vue'
import { useUsageStore } from '@/stores/usage'
import { CATEGORY_ICONS, CATEGORY_COLORS } from '@/constants'
import StatCard from '@/components/common/StatCard.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'

const usage = useUsageStore()

const ranges = [
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
  { value: 365, label: '近一年' },
  { value: 'all', label: '全部' },
]
const range = ref(30)

const sortOptions = [
  { value: 'purchaseCount', label: '采购次数' },
  { value: 'purchasedQty', label: '采购量' },
  { value: 'consumedPerDay', label: '消耗速度' },
  { value: 'consumedQty', label: '消耗量' },
  { value: 'wasteRate', label: '浪费率' },
]
const sortBy = ref('purchaseCount')

const summary = computed(() => usage.summary(range.value))
const topBought = computed(() => usage.mostBought(range.value, 5))
const topConsumed = computed(() => usage.fastestConsumed(range.value, 5))
const allRows = computed(() => {
  const rows = [...usage.ingredientStats(range.value)]
  rows.sort((a, b) => {
    const diff = b[sortBy.value] - a[sortBy.value]
    return diff !== 0 ? diff : b.consumedQty - a.consumedQty
  })
  return rows
})

const tagMeta = {
  staple: { text: '刚需常备', cls: 't-staple', title: '买得勤且消耗快，建议保持库存、优先补货' },
  overbuy: { text: '该少囤', cls: 't-overbuy', title: '丢弃占比偏高，买多了/放坏了，下次减量' },
  overstock: { text: '囤多了', cls: 't-overstock', title: '消耗跟不上采购，库存还在增加，建议少买' },
}

function fmtNum(v, digits = 1) {
  if (!v) return '0'
  return v >= 100 ? Math.round(v).toString() : Number(v.toFixed(digits)).toString()
}

function fmtPercent(v) {
  return Math.round(v * 100) + '%'
}

function fmtInterval(days) {
  if (!days) return '—'
  return days < 1 ? '<1 天' : `${fmtNum(days)} 天`
}

function icon(row) {
  return CATEGORY_ICONS[row.category] || CATEGORY_ICONS['其他']
}
function color(row) {
  return CATEGORY_COLORS[row.category] || CATEGORY_COLORS['其他']
}

// 消耗速度条形图的相对宽度
function barWidth(v, max) {
  return max > 0 ? Math.max(4, (v / max) * 100) : 0
}
const maxConsumeRate = computed(() =>
  Math.max(1, ...topConsumed.value.map((r) => r.consumedPerDay)),
)
const maxBuyCount = computed(() => Math.max(1, ...topBought.value.map((r) => r.purchaseCount)))
</script>

<template>
  <div>
    <div class="page-head">
      <h2>📦 消耗分析</h2>
      <div class="range-chips">
        <button
          v-for="r in ranges"
          :key="r.value"
          class="chip"
          :class="{ on: range === r.value }"
          @click="range = r.value"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <BaseEmpty
      v-if="!allRows.length"
      emoji="📉"
      text="这段时间还没有采购或消耗记录，去采购清单标记入库、在食材库存里点「消耗」后再来看看吧"
    />

    <template v-else>
      <div class="grid grid-4">
        <StatCard label="采购批次" :value="summary.batchCount" suffix="次" icon="🛒" color="#4caf50" />
        <StatCard label="涉及食材" :value="summary.ingredientKinds" suffix="种" icon="🥬" color="#2196f3" />
        <StatCard label="有消耗的食材" :value="summary.consumedKinds" suffix="种" icon="🍽️" color="#ff9800" />
        <StatCard label="有浪费的食材" :value="summary.wasteKinds" suffix="种" icon="🗑️" color="#ef5350" />
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="section-title">
            🔁 最常买 TOP{{ topBought.length }}
            <span class="muted small">按采购次数</span>
          </div>
          <BaseEmpty v-if="!topBought.length" emoji="🛒" text="区间内暂无采购记录" />
          <ul v-else class="rank-list">
            <li v-for="(r, i) in topBought" :key="'b' + r.key" class="rank-row">
              <span class="rank-no" :class="{ top: i < 3 }">{{ i + 1 }}</span>
              <span class="rank-icon" :style="{ background: color(r) + '22' }">{{ icon(r) }}</span>
              <div class="rank-main">
                <div class="rank-name">{{ r.name }}
                  <span v-for="t in r.tags" :key="t" class="mini-tag" :class="tagMeta[t].cls">{{ tagMeta[t].text }}</span>
                </div>
                <div class="bar">
                  <div class="bar-fill green" :style="{ width: barWidth(r.purchaseCount, maxBuyCount) + '%' }"></div>
                </div>
              </div>
              <div class="rank-val">
                <strong>{{ r.purchaseCount }}</strong> 次
                <div class="muted small">共 {{ fmtNum(r.purchasedQty) }} {{ r.unit }}</div>
              </div>
            </li>
          </ul>
        </div>

        <div class="card">
          <div class="section-title">
            ⚡ 消耗最快 TOP{{ topConsumed.length }}
            <span class="muted small">按日均消耗量</span>
          </div>
          <BaseEmpty v-if="!topConsumed.length" emoji="🍽️" text="区间内暂无消耗记录" />
          <ul v-else class="rank-list">
            <li v-for="(r, i) in topConsumed" :key="'c' + r.key" class="rank-row">
              <span class="rank-no" :class="{ top: i < 3 }">{{ i + 1 }}</span>
              <span class="rank-icon" :style="{ background: color(r) + '22' }">{{ icon(r) }}</span>
              <div class="rank-main">
                <div class="rank-name">{{ r.name }}
                  <span v-for="t in r.tags" :key="t" class="mini-tag" :class="tagMeta[t].cls">{{ tagMeta[t].text }}</span>
                </div>
                <div class="bar">
                  <div class="bar-fill orange" :style="{ width: barWidth(r.consumedPerDay, maxConsumeRate) + '%' }"></div>
                </div>
              </div>
              <div class="rank-val">
                <strong>{{ fmtNum(r.consumedPerDay, 2) }}</strong> {{ r.unit }}/天
                <div class="muted small">共消耗 {{ fmtNum(r.consumedQty) }} {{ r.unit }}</div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div class="card insight">
        <div class="insight-title">💡 补货建议</div>
        <div class="insight-grid">
          <div class="insight-col staple">
            <div class="insight-head"><span class="dot t-staple"></span>刚需常备 · 优先补货</div>
            <template v-if="allRows.filter((r) => r.tags.includes('staple')).length">
              <span v-for="r in allRows.filter((r) => r.tags.includes('staple'))" :key="'s' + r.key" class="pill green">
                {{ r.name }} · 每 {{ fmtInterval(r.avgInterval) }}买一次
              </span>
            </template>
            <span v-else class="muted small">暂无，采购 {{ range === 30 ? '3 次以上且吃掉六成' : '次数多、消耗快' }} 的食材会出现在这里</span>
          </div>
          <div class="insight-col overbuy">
            <div class="insight-head"><span class="dot t-overbuy"></span>该少囤 · 买多放坏了</div>
            <template v-if="allRows.filter((r) => r.tags.includes('overbuy')).length">
              <span v-for="r in allRows.filter((r) => r.tags.includes('overbuy'))" :key="'o' + r.key" class="pill red">
                {{ r.name }} · 丢了 {{ fmtNum(r.discardedQty) }} {{ r.unit }}（{{ fmtPercent(r.wasteRate) }}）
              </span>
            </template>
            <span v-else class="muted small">没有明显浪费，继续保持 👍</span>
          </div>
          <div class="insight-col overstock">
            <div class="insight-head"><span class="dot t-overstock"></span>囤多了 · 吃得慢、还在攒</div>
            <template v-if="allRows.filter((r) => r.tags.includes('overstock')).length">
              <span v-for="r in allRows.filter((r) => r.tags.includes('overstock'))" :key="'k' + r.key" class="pill amber">
                {{ r.name }} · 仅吃掉 {{ fmtPercent(r.consumeRatio) }}
              </span>
            </template>
            <span v-else class="muted small">采购与消耗基本匹配</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="section-title">
          食材明细
          <div class="sort-tabs">
            <span class="muted small">排序：</span>
            <button
              v-for="opt in sortOptions"
              :key="opt.value"
              class="chip sm"
              :class="{ on: sortBy === opt.value }"
              @click="sortBy = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="usage-table">
            <thead>
              <tr>
                <th>食材</th>
                <th class="num">采购次数</th>
                <th class="num">采购量</th>
                <th class="num">消耗量</th>
                <th class="num">日均消耗</th>
                <th class="num">采购间隔</th>
                <th class="num">浪费率</th>
                <th>结论</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in allRows" :key="r.key">
                <td>
                  <span class="t-icon" :style="{ background: color(r) + '22' }">{{ icon(r) }}</span>
                  <span class="t-name">{{ r.name }}</span>
                  <span class="muted small">{{ r.unit }}</span>
                </td>
                <td class="num">{{ r.purchaseCount }}</td>
                <td class="num">{{ fmtNum(r.purchasedQty) }}</td>
                <td class="num">{{ fmtNum(r.consumedQty) }}</td>
                <td class="num">{{ fmtNum(r.consumedPerDay, 2) }}</td>
                <td class="num">{{ fmtInterval(r.avgInterval) }}</td>
                <td class="num" :class="{ warn: r.wasteRate >= 0.25 }">
                  {{ r.discardedQty > 0 ? fmtPercent(r.wasteRate) : '—' }}
                </td>
                <td>
                  <span v-for="t in r.tags" :key="t" class="mini-tag" :class="tagMeta[t].cls" :title="tagMeta[t].title">
                    {{ tagMeta[t].text }}
                  </span>
                  <span v-if="!r.tags.length" class="muted small">正常</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted small footnote">
          说明：采购次数按采购批次统计；日均消耗按所选区间天数折算；直接删除食材记为丢弃，计入浪费率。
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
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}
.page-head h2 {
  margin: 0;
}
.range-chips {
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
.small {
  font-size: 12px;
}

/* 排行榜 */
.rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rank-no {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.rank-no.top {
  background: var(--primary);
  color: #fff;
}
.rank-icon {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  flex-shrink: 0;
}
.rank-main {
  flex: 1;
  min-width: 0;
}
.rank-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.bar {
  height: 6px;
  border-radius: 3px;
  background: var(--surface-2);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 3px;
}
.bar-fill.green {
  background: var(--primary);
}
.bar-fill.orange {
  background: var(--warn);
}
.rank-val {
  text-align: right;
  font-size: 13px;
  flex-shrink: 0;
  min-width: 96px;
}
.rank-val strong {
  font-size: 16px;
}

/* 标签 */
.mini-tag {
  font-size: 11px;
  line-height: 1;
  padding: 3px 7px;
  border-radius: 10px;
  font-weight: 600;
  white-space: nowrap;
}
.t-staple {
  background: var(--primary-light);
  color: var(--primary-dark);
}
.t-overbuy {
  background: var(--danger-light);
  color: var(--danger);
}
.t-overstock {
  background: var(--warn-light);
  color: #e65100;
}

/* 建议区 */
.insight-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.insight-title {
  font-weight: 600;
  margin-bottom: 12px;
}
.insight-col {
  background: var(--surface-2);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.insight-head {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.pill {
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 14px;
  line-height: 1.4;
}
.pill.green {
  background: #fff;
  color: var(--primary-dark);
  border: 1px solid var(--primary);
}
.pill.red {
  background: #fff;
  color: var(--danger);
  border: 1px solid var(--danger);
}
.pill.amber {
  background: #fff;
  color: #e65100;
  border: 1px solid var(--warn);
}

/* 明细表 */
.sort-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.table-wrap {
  overflow-x: auto;
}
.usage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.usage-table th,
.usage-table td {
  text-align: left;
  padding: 9px 10px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.usage-table th {
  color: var(--text-2);
  font-weight: 500;
  font-size: 12px;
  background: var(--surface-2);
}
.usage-table .num {
  text-align: right;
}
.usage-table td.warn {
  color: var(--danger);
  font-weight: 600;
}
.t-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  margin-right: 6px;
  vertical-align: middle;
}
.t-name {
  font-weight: 600;
  margin-right: 4px;
}
.footnote {
  margin: 10px 0 0;
}

@media (max-width: 900px) {
  .insight-grid {
    grid-template-columns: 1fr;
  }
}
</style>

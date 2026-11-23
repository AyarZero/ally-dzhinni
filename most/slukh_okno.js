/* Нарезчик речи для слуха по ходу (окно и проверка в Node). Звук не выбрасывается никогда: хвост с последнего
 * среза растёт, окно раз в 1,5 с показывает его черновую расшифровку, а когда в хвосте ≥ 6 с и человек замолчал
 * на полсекунды — хвост отрезается и расшифровывается набело. Длинную речь без пауз режем на 15-й секунде по самому
 * тихому месту после 8-й. Куски по 6–15 с: у GigaAM хватает связи для знаков препинания. Тишина — относительно
 * громкости самого человека, а не по одному порогу: тихие голоса не теряются. */
globalThis.DzhNarezchik = class {
  constructor(sr = 16000) { this.sr = sr; this.k = []; this.r = []; this.n = 0 }
  static rms(d) { let s = 0; for (const x of d) s += x * x; return Math.sqrt(s / d.length) }
  porog() { const a = [...this.r].sort((x, y) => x - y); return Math.max(0.006, 0.3 * (a[Math.floor(a.length * 0.8)] || 0)) }
  srez(i) { // отдать кадры [0, i), остальное оставить хвостом
    const kus = this.k.slice(0, i), out = new Float32Array(kus.reduce((a, b) => a + b.length, 0))
    let o = 0; for (const b of kus) { out.set(b, o); o += b.length }
    this.k = this.k.slice(i); this.r = this.r.slice(i); this.n = this.k.reduce((a, b) => a + b.length, 0)
    return out
  }
  kadr(d) { // d — Float32Array кадра; вернёт готовый кусок или null
    this.k.push(d); this.r.push(DzhNarezchik.rms(d)); this.n += d.length
    const sek = this.n / this.sr, kadrSek = d.length / this.sr
    if (Math.max(...this.r) < 0.006 && sek > 3) { this.srez(this.k.length - 3); return null } // одна тишина — не копим
    const p = this.porog(), tihih = Math.ceil(0.5 / kadrSek)
    if (sek >= 6 && this.r.length > tihih && this.r.slice(-tihih).every((x) => x < p)) return this.srez(this.k.length)
    if (sek >= 15) {
      let iMin = this.k.length - 1, min = Infinity
      for (let i = Math.floor(8 / kadrSek); i < this.k.length; i++) if (this.r[i] < min) { min = this.r[i]; iMin = i }
      return this.srez(iMin + 1)
    }
    return null
  }
  hvost() { const a = new Float32Array(this.n); let o = 0; for (const b of this.k) { a.set(b, o); o += b.length } return a }
  estRech() { return this.r.some((x) => x >= this.porog()) && this.n >= this.sr * 0.8 }
  konec() { return this.n ? this.srez(this.k.length) : null }
}

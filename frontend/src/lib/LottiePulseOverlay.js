// Lightweight DOM overlay that positions a <lottie-player> at a LatLng.
export default class LottiePulseOverlay extends google.maps.OverlayView {
  constructor({ map, position, src, size = { width: 120, height: 120 }, zIndex = 9999 }) {
    super()
    this.map = map
    this.position = position
    this.src = src
    this.size = size
    this.zIndex = zIndex
    this.container = null
    this.setMap(map)
  }

  onAdd() {
    const div = document.createElement('div')
    div.style.position = 'absolute'
    div.style.width = `${this.size.width}px`
    div.style.height = `${this.size.height}px`
    div.style.pointerEvents = 'none'
    div.style.zIndex = String(this.zIndex)

    const player = document.createElement('lottie-player')
    player.setAttribute('src', this.src)
    player.setAttribute('background', 'transparent')
    player.setAttribute('speed', '1')
    player.setAttribute('autoplay', '')
    player.setAttribute('loop', '')
    player.style.width = '100%'
    player.style.height = '100%'

    div.appendChild(player)
    this.container = div

    const panes = this.getPanes()
    panes.overlayMouseTarget.appendChild(div) // above markers; use overlayLayer if you want under clicks
  }

  draw() {
    if (!this.container) return
    const projection = this.getProjection()
    if (!projection) return
    const point = projection.fromLatLngToDivPixel(this.position)
    if (!point) return

    const { width, height } = this.size
    // center the animation on the point
    this.container.style.left = `${point.x - width / 2}px`
    this.container.style.top = `${point.y - height / 2}px`
  }

  onRemove() {
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container)
    }
    this.container = null
  }

  setPosition(position) {
    this.position = position
    this.draw()
  }
}
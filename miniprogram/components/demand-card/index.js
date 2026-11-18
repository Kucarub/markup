Component({
  options: {
    styleIsolation: 'apply-shared',
  },
  properties: {
    demand: {
      type: Object,
      value: {},
    },
    compact: {
      type: Boolean,
      value: false,
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('open', { id: this.data.demand.id })
    },
  },
})

Component({
  options: {
    styleIsolation: 'apply-shared',
  },
  properties: {
    title: {
      type: String,
      value: '',
    },
    description: {
      type: String,
      value: '',
    },
    action: {
      type: String,
      value: '',
    },
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    },
  },
})

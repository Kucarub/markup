Page({
  data: {
    inputValue: '',
    dateValue: '',
  },

  onInput(event) {
    this.setData({ inputValue: event.detail.value })
  },

  onDateChange(event) {
    this.setData({ dateValue: event.detail.value })
  },
})

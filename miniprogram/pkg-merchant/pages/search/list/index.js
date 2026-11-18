const { businessGuard } = require('../../../../utils/guard')

Page({
  data: {
    filters: ['风格', '从业年限', '可约日期', '距离'],
  },

  onShow() {
    businessGuard()
  },
})

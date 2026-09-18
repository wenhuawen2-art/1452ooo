Component({
  properties: {
    checked: { type: Boolean, value: false },
  },
  methods: {
    toggle() {
      this.triggerEvent("toggle");
    },
  },
});

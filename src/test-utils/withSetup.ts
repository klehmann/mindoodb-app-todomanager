import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";

export function withSetup<T>(useHook: () => T) {
  let result!: T;

  const wrapper = mount(defineComponent({
    setup() {
      result = useHook();
      return () => null;
    },
  }));

  return {
    result,
    unmount: () => wrapper.unmount(),
  };
}

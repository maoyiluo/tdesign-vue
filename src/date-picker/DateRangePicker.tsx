import {
  defineComponent, watch, computed, ref,
} from '@vue/composition-api';
import dayjs from 'dayjs';
import { CalendarIcon as TdCalendarIcon } from 'tdesign-icons-vue';
import { usePrefixClass } from '../hooks/useConfig';
import { useGlobalIcon } from '../hooks/useGlobalIcon';

import props from './date-range-picker-props';
import { DateValue, DateRangePickerPartial } from './type';

import { RangeInputPopup as TRangeInputPopup } from '../range-input';
import TRangePanel from './panel/RangePanel';
import useRange from './hooks/useRange';
import {
  parseToDayjs,
  formatTime,
  formatDate,
  isValidDate,
  getDefaultFormat,
  initYearMonthTime,
} from '../_common/js/date-picker/format';
import { subtractMonth, addMonth, extractTimeObj } from '../_common/js/date-picker/utils';
import useFormDisabled from '../hooks/useFormDisabled';
import { dateCorrection } from './utils';

export default defineComponent({
  name: 'TDateRangePicker',
  props,
  setup(props, { emit }) {
    const COMPONENT_NAME = usePrefixClass('date-range-picker');
    const { CalendarIcon } = useGlobalIcon({ CalendarIcon: TdCalendarIcon });
    const { formDisabled } = useFormDisabled();

    const {
      inputValue,
      popupVisible,
      rangeInputProps: dateRangePickerRangeInputProps,
      popupProps: dateRangePickerPopupProps,
      value,
      year,
      month,
      time,
      cacheValue,
      activeIndex,
      isHoverCell,
      isFirstValueSelected,
      onChange,
    } = useRange(props, { emit });

    const formatRef = computed(() => getDefaultFormat({
      mode: props.mode,
      enableTimePicker: props.enableTimePicker,
      format: props.format,
      valueType: props.valueType,
    }));
    const isDisabled = computed(() => formDisabled.value || props.disabled);

    // 记录面板是否选中过
    const isSelected = ref(false);

    watch(popupVisible, (visible) => {
      // 面板展开重置数据
      if (visible) {
        isSelected.value = false;
        cacheValue.value = formatDate(value.value || [], {
          format: formatRef.value.format,
        }) as string[];
        time.value = formatTime(
          value.value || [dayjs().format(formatRef.value.timeFormat), dayjs().format(formatRef.value.timeFormat)],
          formatRef.value.format,
          formatRef.value.timeFormat,
          props.defaultTime,
        ) as string[];

        // 空数据重置为当前年月
        if (!value.value.length) {
          const { year: defaultYear, month: defaultMonth } = initYearMonthTime({
            value: value.value,
            mode: props.mode,
            format: formatRef.value.format,
            enableTimePicker: props.enableTimePicker,
          });
          year.value = defaultYear;
          month.value = defaultMonth;
        } else if (value.value.length === 2 && !props.enableTimePicker) {
          // 确保右侧面板月份比左侧大 避免两侧面板月份一致
          const nextMonth = value.value.map((v: string) => parseToDayjs(v, formatRef.value.format).month());
          year.value = value.value.map((v: string) => parseToDayjs(v, formatRef.value.format).year());
          if (year.value[0] === year.value[1] && nextMonth[0] === nextMonth[1]) {
            nextMonth[0] === 11 ? (nextMonth[0] -= 1) : (nextMonth[1] += 1);
          }
          month.value = nextMonth;
          // 月份季度选择时需要确保右侧面板年份比左侧大
          if ((props.mode === 'month' || props.mode === 'quarter') && year.value[0] === year.value[1]) {
            year.value = [year.value[0], year.value[0] + 1];
          }
        } else {
          year.value = value.value.map((v: string) => parseToDayjs(v, formatRef.value.format).year());
          if (year.value.length === 1) year.value = [year.value[0], year.value[0]];

          month.value = value.value.map((v: string) => parseToDayjs(v, formatRef.value.format).month());
          if (month.value.length === 1) month.value = [month.value[0], Math.min(month.value[0] + 1, 11)];
        }
      } else {
        activeIndex.value = 0;
        isHoverCell.value = false;
        isFirstValueSelected.value = false;
        inputValue.value = formatDate(value.value, {
          format: formatRef.value.format,
        });
      }
    });

    // 日期 hover
    function onCellMouseEnter(nextDate: Date) {
      const date = nextDate;
      // 不开启时间选择时 结束时间默认重置为 23:59:59
      if (activeIndex.value && !props.enableTimePicker) date.setHours(23, 59, 59);

      isHoverCell.value = true;
      const nextValue = [...(inputValue.value as string[])];
      nextValue[activeIndex.value] = formatDate(date, {
        format: formatRef.value.format,
      }) as string;
      inputValue.value = nextValue;
    }

    // 日期 leave
    function onCellMouseLeave() {
      isHoverCell.value = false;
      inputValue.value = cacheValue.value;
    }

    // 日期点击
    function onCellClick(nextDate: Date, { e }: { e: MouseEvent; partial: DateRangePickerPartial }) {
      const date = nextDate;
      // 不开启时间选择时 结束时间默认重置为 23:59:59
      if (activeIndex.value && !props.enableTimePicker) date.setHours(23, 59, 59);

      props.onPick?.(date, { e, partial: activeIndex.value ? 'end' : 'start' });
      emit('pick', date, { e, partial: activeIndex.value ? 'end' : 'start' });

      isHoverCell.value = false;
      isSelected.value = true;

      const nextValue = [...(inputValue.value as string[])];
      nextValue[activeIndex.value] = formatDate(date, {
        format: formatRef.value.format,
      }) as string;
      cacheValue.value = nextValue;
      inputValue.value = nextValue;

      // 有时间选择器走 confirm 逻辑
      if (props.enableTimePicker) return;

      // 确保两端都是有效值
      const notValidIndex = nextValue.findIndex((v) => !v || !isValidDate(v, formatRef.value.format));

      // 当两端都有有效值时更改 value
      if (notValidIndex === -1 && nextValue.length === 2) {
        // 二次修改时当其中一侧不符合上次区间规范时，清空另一侧数据
        if (
          !isFirstValueSelected.value
          && parseToDayjs(nextValue[0], formatRef.value.format).isAfter(parseToDayjs(nextValue[1], formatRef.value.format))
        ) {
          nextValue[activeIndex.value ? 0 : 1] = '';
          cacheValue.value = nextValue;
          inputValue.value = nextValue;
        } else {
          onChange?.(
            formatDate(nextValue, {
              format: formatRef.value.format,
              targetFormat: formatRef.value.valueType,
              autoSwap: true,
            }) as DateValue[],
            {
              dayjsValue: nextValue.map((v) => parseToDayjs(v, formatRef.value.format)),
              trigger: 'pick',
            },
          );
        }
      }

      // 首次点击不关闭、确保两端都有有效值并且无时间选择器时点击后自动关闭
      if (!isFirstValueSelected.value) {
        let nextIndex = notValidIndex;
        if (nextIndex === -1) nextIndex = activeIndex.value ? 0 : 1;
        activeIndex.value = nextIndex;
        isFirstValueSelected.value = true;
      } else {
        popupVisible.value = false;
      }
    }

    // 头部快速切换
    function onJumperClick({ trigger, partial }: { trigger: string; partial: DateRangePickerPartial }) {
      const partialIndex = partial === 'start' ? 0 : 1;

      const monthCountMap = {
        date: 1,
        week: 1,
        month: 12,
        quarter: 12,
        year: 120,
      };
      const monthCount = monthCountMap[props.mode] || 0;
      const current = new Date(year.value[partialIndex], month.value[partialIndex]);

      let next = null;
      if (trigger === 'prev') {
        next = subtractMonth(current, monthCount);
      } else if (trigger === 'current') {
        next = new Date();
      } else if (trigger === 'next') {
        next = addMonth(current, monthCount);
      }

      let nextYear = [...year.value];
      nextYear[partialIndex] = next.getFullYear();
      let nextMonth = [...month.value];
      nextMonth[partialIndex] = next.getMonth();
      const onlyYearSelect = ['year', 'quarter', 'month'].includes(props.mode);

      // 头部日期切换修正
      const correctedDate = dateCorrection(partialIndex, nextYear, nextMonth, onlyYearSelect);
      nextYear = correctedDate.nextYear;
      nextMonth = correctedDate.nextMonth;

      year.value = nextYear;
      month.value = nextMonth;
    }

    // time-picker 点击
    function onTimePickerChange(val: string) {
      const {
        hours, minutes, seconds, milliseconds, meridiem,
      } = extractTimeObj(val);

      const nextInputValue = [...(inputValue.value as DateValue[])];
      const changedInputValue = inputValue.value[activeIndex.value];
      const currentDate = !dayjs(changedInputValue, formatRef.value.format).isValid()
        ? dayjs().year(year.value[activeIndex.value]).month(month.value[activeIndex.value])
        : dayjs(changedInputValue, formatRef.value.format);
      // am pm 12小时制转化 24小时制
      let nextHours = hours;
      if (/am/i.test(meridiem) && nextHours === 12) nextHours -= 12;
      if (/pm/i.test(meridiem) && nextHours < 12) nextHours += 12;

      const nextDate = currentDate.hour(nextHours).minute(minutes).second(seconds).millisecond(milliseconds)
        .toDate();
      nextInputValue[activeIndex.value] = nextDate;

      const nextTime = [...time.value];
      nextTime[activeIndex.value] = val;
      time.value = nextTime;

      isSelected.value = true;
      inputValue.value = formatDate(nextInputValue, {
        format: formatRef.value.format,
      });
      cacheValue.value = formatDate(nextInputValue, {
        format: formatRef.value.format,
      });
    }

    // 确定
    function onConfirmClick({ e }: { e: MouseEvent }) {
      const nextValue = [...(inputValue.value as string[])];

      const notValidIndex = nextValue.findIndex((v) => !v || !isValidDate(v, formatRef.value.format));

      // 当两端都有有效值时更改 value
      if (notValidIndex === -1 && nextValue.length === 2) {
        // 二次修改时当其中一侧不符合上次区间规范时，清空另一侧数据
        if (
          !isFirstValueSelected.value
          && parseToDayjs(nextValue[0], formatRef.value.format).isAfter(parseToDayjs(nextValue[1], formatRef.value.format))
        ) {
          nextValue[activeIndex.value ? 0 : 1] = '';
          cacheValue.value = nextValue;
          inputValue.value = nextValue;
        } else {
          props?.onConfirm?.({
            date: nextValue.map((v) => dayjs(v).toDate()),
            e,
            partial: activeIndex.value ? 'end' : 'start',
          });
          onChange?.(
            formatDate(nextValue, {
              format: formatRef.value.format,
              targetFormat: formatRef.value.valueType,
              autoSwap: true,
            }) as DateValue[],
            {
              dayjsValue: nextValue.map((v) => parseToDayjs(v, formatRef.value.format)),
              trigger: 'confirm',
            },
          );
        }
      }

      // 首次点击不关闭、确保两端都有有效值并且无时间选择器时点击后自动关闭
      if (nextValue.length === 1 || !isFirstValueSelected.value) {
        let nextIndex = notValidIndex;
        if (nextIndex === -1) nextIndex = activeIndex.value ? 0 : 1;
        activeIndex.value = nextIndex;
        isFirstValueSelected.value = true;
      } else if (nextValue.length === 2) {
        popupVisible.value = false;
      }
    }

    // 预设
    function onPresetClick(preset: any, context: any) {
      let presetValue = preset;
      if (typeof preset === 'function') {
        presetValue = preset();
      }
      if (!Array.isArray(presetValue)) {
        console.error(`preset: ${preset} 预设值必须是数组!`);
      } else {
        onChange?.(
          formatDate(presetValue, {
            format: formatRef.value.format,
            targetFormat: formatRef.value.valueType,
            autoSwap: true,
          }) as DateValue[],
          {
            dayjsValue: presetValue.map((p) => parseToDayjs(p, formatRef.value.format)),
            trigger: 'preset',
          },
        );
        popupVisible.value = false;
        props.onPresetClick?.(context);
        emit('preset-click', context);
      }
    }

    function onYearChange(nextVal: number, { partial }: { partial: DateRangePickerPartial }) {
      let partialIndex = partial === 'start' ? 0 : 1;
      if (props.enableTimePicker) partialIndex = activeIndex.value;

      let nextYear = [...year.value];
      let nextMonth = [...month.value];
      nextYear[partialIndex] = nextVal;
      const onlyYearSelect = ['year', 'quarter', 'month'].includes(props.mode);

      // 头部日期切换修正
      const correctedDate = dateCorrection(partialIndex, nextYear, nextMonth, onlyYearSelect);
      nextYear = correctedDate.nextYear;
      nextMonth = correctedDate.nextMonth;

      year.value = nextYear;
      if (!onlyYearSelect) month.value = nextMonth;
    }

    function onMonthChange(nextVal: number, { partial }: { partial: DateRangePickerPartial }) {
      let partialIndex = partial === 'start' ? 0 : 1;
      if (props.enableTimePicker) partialIndex = activeIndex.value;

      const nextMonth = [...month.value];
      nextMonth[partialIndex] = nextVal;
      // 保证左侧时间不大于右侧
      if (year.value[0] === year.value[1]) {
        if (partialIndex === 0) {
          // 操作了左侧区间, 处理右侧区间小于或等于左侧区间的场景，交互上始终报错右侧比左侧大 1
          if (nextMonth[1] <= nextMonth[0]) {
            nextMonth[1] = nextMonth[0] + 1;
            if (nextMonth[1] === 12) {
              // 处理跨年的边界场景
              nextMonth[1] = 0;
              year.value = [year.value?.[0], year.value?.[1] + 1];
            }
          }
        }
        if (partialIndex === 1) {
          // 操作了右侧区间, 处理右侧区间小于或等于左侧区间的场景，交互上始终报错左侧比右侧小 1
          nextMonth[0] = Math.min(nextMonth[0], nextMonth[1]);
          if (nextMonth[0] >= nextMonth[1]) {
            nextMonth[0] -= 1;
            if (nextMonth[0] === -1) {
              // 处理跨年的边界场景
              nextMonth[0] = 11;
              year.value = [year.value?.[0] - 1, year.value?.[1]];
            }
          }
        }
      }

      month.value = nextMonth;
    }

    const panelProps: any = computed(() => ({
      hoverValue: (isHoverCell.value ? inputValue.value : []) as string[],
      value: (isSelected.value ? cacheValue.value : value.value) as string[],
      isFirstValueSelected: isFirstValueSelected.value,
      activeIndex: activeIndex.value,
      year: year.value,
      month: month.value,
      format: formatRef.value.format,
      mode: props.mode,
      presets: props.presets,
      time: time.value,
      disableDate: props.disableDate,
      disableTime: props.disableTime,
      firstDayOfWeek: props.firstDayOfWeek,
      timePickerProps: props.timePickerProps,
      enableTimePicker: props.enableTimePicker,
      presetsPlacement: props.presetsPlacement,
      panelPreselection: props.panelPreselection,
      popupVisible: popupVisible.value,
      cancelRangeSelectLimit: props.cancelRangeSelectLimit,
      onCellClick,
      onCellMouseEnter,
      onCellMouseLeave,
      onJumperClick,
      onConfirmClick,
      onPresetClick,
      onYearChange,
      onMonthChange,
      onTimePickerChange,
    }));

    return {
      COMPONENT_NAME,
      inputValue,
      dateRangePickerPopupProps,
      dateRangePickerRangeInputProps,
      popupVisible,
      panelProps,
      CalendarIcon,
      isDisabled,
    };
  },
  render() {
    const {
      COMPONENT_NAME,
      inputValue,
      dateRangePickerPopupProps,
      dateRangePickerRangeInputProps,
      popupVisible,
      panelProps,
      CalendarIcon,
    } = this;

    const renderSuffixIcon = () => {
      if (this.suffixIcon) return this.suffixIcon;
      if (this.$scopedSlots.suffixIcon) return this.$scopedSlots.suffixIcon;
      if (this.$scopedSlots['suffix-icon']) return this.$scopedSlots['suffix-icon'];

      return () => <CalendarIcon />;
    };

    return (
      <div class={COMPONENT_NAME}>
        <TRangeInputPopup
          disabled={this.isDisabled}
          label={this.label}
          status={this.status}
          tips={this.tips || this.$scopedSlots.tips}
          inputValue={inputValue as string[]}
          popupProps={dateRangePickerPopupProps}
          rangeInputProps={{
            suffixIcon: renderSuffixIcon(),
            ...dateRangePickerRangeInputProps,
          }}
          popupVisible={popupVisible}
          panel={() => <TRangePanel {...{ props: panelProps }} />}
        />
      </div>
    );
  },
});

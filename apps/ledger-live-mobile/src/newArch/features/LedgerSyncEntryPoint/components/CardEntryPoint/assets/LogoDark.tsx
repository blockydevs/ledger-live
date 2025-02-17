import React from "react";
import Svg, { SvgProps, Rect, Path, Defs, LinearGradient, Stop } from "react-native-svg";

const SvgComponent = (props: SvgProps) => (
  <Svg width={52} height={52} fill="none" {...props}>
    <Rect width={52} height={52} fill="#fff" fillOpacity={0.01} rx={13.619} />
    <Rect width={52} height={52} fill="url(#a)" rx={13.5} />
    <Rect
      width={51.5}
      height={51.5}
      x={0.25}
      y={0.25}
      stroke="url(#b)"
      strokeOpacity={0.16}
      strokeWidth={0.5}
      rx={13.25}
    />
    <Rect
      width={37.741}
      height={37.741}
      x={7.259}
      y={7.256}
      fill="#BBB0FF"
      fillOpacity={0.08}
      rx={8.709}
    />
    <Path
      stroke="#BBB0FF"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.286}
      d="M36.28 26.167a10.116 10.116 0 0 1-2.966 7.144c-3.968 3.968-10.402 3.968-14.37 0a10.165 10.165 0 0 1-1.735-2.325m-1.236-5.025a10.121 10.121 0 0 1 2.971-7.02c3.968-3.967 10.402-3.967 14.37 0 .706.707 1.28 1.493 1.735 2.326m-3.899.001h4.49v-4.49M21.108 30.984h-4.49v4.49"
    />
    <Defs>
      <LinearGradient id="a" x1={26.361} x2={26.361} y1={0} y2={52} gradientUnits="userSpaceOnUse">
        <Stop stopColor="#fff" stopOpacity={0.05} />
        <Stop offset={1} stopColor="#1D1C1F" stopOpacity={0} />
      </LinearGradient>
      <LinearGradient id="b" x1={26.361} x2={26.361} y1={0} y2={52} gradientUnits="userSpaceOnUse">
        <Stop stopColor="#fff" />
        <Stop offset={1} stopOpacity={0.5} />
      </LinearGradient>
    </Defs>
  </Svg>
);
export default SvgComponent;

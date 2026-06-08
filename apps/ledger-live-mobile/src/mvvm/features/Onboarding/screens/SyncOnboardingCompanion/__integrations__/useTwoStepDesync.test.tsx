import { renderHook, act } from "@tests/test-renderer";
import useTwoStepDesync, {
  NORMAL_DESYNC_OVERLAY_DISPLAY_DELAY_MS,
} from "../hooks/useTwoStepDesync";

const NORMAL_DESYNC_TIMEOUT_MS = 60000;
const LONG_DESYNC_TIMEOUT_MS = 120000;
const LONG_DESYNC_OVERLAY_DISPLAY_DELAY_MS = 60000;

jest.useFakeTimers();

describe("useTwoStepDesync", () => {
  const defaultProps = () => ({
    onLostDevice: jest.fn(),
    onShouldHeaderBeOverlaid: jest.fn(),
    updateHeaderOverlayDelay: jest.fn(),
    setIsPollingOn: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it("should initialize with the overlay closed and the normal display delay", () => {
    const { result } = renderHook(() => useTwoStepDesync(defaultProps()));

    expect(result.current.isDesyncOverlayOpen).toBe(false);
    expect(result.current.desyncOverlayDisplayDelayMs).toBe(NORMAL_DESYNC_OVERLAY_DISPLAY_DELAY_MS);
  });

  it("should open the overlay and overlay the header when a polling error occurs", () => {
    const props = defaultProps();
    const { result } = renderHook(() => useTwoStepDesync(props));

    act(() => {
      result.current.handlePollingError(new Error("desync"));
    });

    expect(result.current.isDesyncOverlayOpen).toBe(true);
    expect(props.onShouldHeaderBeOverlaid).toHaveBeenCalledWith(true);
    expect(props.onLostDevice).not.toHaveBeenCalled();
  });

  it("should close the overlay and stop overlaying the header when the polling error is cleared", () => {
    const props = defaultProps();
    const { result } = renderHook(() => useTwoStepDesync(props));

    act(() => {
      result.current.handlePollingError(new Error("desync"));
    });

    act(() => {
      result.current.handlePollingError(null);
    });

    expect(result.current.isDesyncOverlayOpen).toBe(false);
    expect(props.onShouldHeaderBeOverlaid).toHaveBeenLastCalledWith(false);
  });

  it("should report the device as lost and stop polling once the desync times out", () => {
    const props = defaultProps();
    const { result } = renderHook(() => useTwoStepDesync(props));

    act(() => {
      result.current.handlePollingError(new Error("desync"));
    });

    act(() => {
      jest.advanceTimersByTime(NORMAL_DESYNC_TIMEOUT_MS);
    });

    expect(result.current.isDesyncOverlayOpen).toBe(false);
    expect(props.onShouldHeaderBeOverlaid).toHaveBeenLastCalledWith(false);
    expect(props.onLostDevice).toHaveBeenCalledTimes(1);
    expect(props.setIsPollingOn).toHaveBeenCalledWith(false);
  });

  it("should not time out before the normal desync timeout elapses", () => {
    const props = defaultProps();
    const { result } = renderHook(() => useTwoStepDesync(props));

    act(() => {
      result.current.handlePollingError(new Error("desync"));
    });

    act(() => {
      jest.advanceTimersByTime(NORMAL_DESYNC_TIMEOUT_MS - 1);
    });

    expect(props.onLostDevice).not.toHaveBeenCalled();
  });

  it("should extend the display delay and timeout when a seed generation delay is signalled", () => {
    const props = defaultProps();
    const { result } = renderHook(() => useTwoStepDesync(props));

    act(() => {
      result.current.handleSeedGenerationDelay();
    });

    expect(result.current.desyncOverlayDisplayDelayMs).toBe(LONG_DESYNC_OVERLAY_DISPLAY_DELAY_MS);
    expect(props.updateHeaderOverlayDelay).toHaveBeenCalledWith(
      LONG_DESYNC_OVERLAY_DISPLAY_DELAY_MS,
    );

    act(() => {
      result.current.handlePollingError(new Error("desync"));
    });

    // Should not time out at the normal timeout now that the long timeout applies
    act(() => {
      jest.advanceTimersByTime(NORMAL_DESYNC_TIMEOUT_MS);
    });
    expect(props.onLostDevice).not.toHaveBeenCalled();

    // Reaching the long timeout triggers the desync handling
    act(() => {
      jest.advanceTimersByTime(LONG_DESYNC_TIMEOUT_MS - NORMAL_DESYNC_TIMEOUT_MS);
    });
    expect(props.onLostDevice).toHaveBeenCalledTimes(1);
  });
});

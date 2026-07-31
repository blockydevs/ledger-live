import { resolveProgramImports } from "./devnode";

// Mock fetch to avoid needing a live devnode
const mockFetch = jest.fn();
global.fetch = mockFetch as jest.Mock<typeof fetch>;

describe("resolveProgramImports", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("resolves direct and transitive imports into one flat map", async () => {
    const sources: Record<string, string> = {
      "b.aleo": "program b.aleo;\n\nfunction f:\n",
      "a.aleo": "import b.aleo;\nprogram a.aleo;\n\nfunction f:\n",
    };

    mockFetch.mockImplementation(async (url: string) => {
      const programId = (url as string).match(/\/program\/([^/]+)/)?.[1];
      if (programId && sources[programId]) {
        return {
          ok: true,
          json: async () => sources[programId],
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const imports = await resolveProgramImports(
      "import a.aleo;\nprogram c.aleo;\n\nfunction f:\n",
    );

    expect(imports).toStrictEqual({ "a.aleo": sources["a.aleo"], "b.aleo": sources["b.aleo"] });
  });

  it("returns an empty map for a source with no imports", async () => {
    const imports = await resolveProgramImports("program merkle_tree.aleo;\n\nfunction f:\n");
    expect(imports).toStrictEqual({});
  });

  it("handles circular import graphs without infinite recursion", async () => {
    const sources: Record<string, string> = {
      "a.aleo": "import b.aleo;\nprogram a.aleo;\n\nfunction f:\n",
      "b.aleo": "import a.aleo;\nprogram b.aleo;\n\nfunction f:\n",
    };

    mockFetch.mockImplementation(async (url: string) => {
      const programId = (url as string).match(/\/program\/([^/]+)/)?.[1];
      if (programId && sources[programId]) {
        return {
          ok: true,
          json: async () => sources[programId],
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const imports = await resolveProgramImports(
      "import a.aleo;\nprogram c.aleo;\n\nfunction f:\n",
    );

    // Should resolve both a and b exactly once, with no stack overflow
    expect(imports).toStrictEqual({ "a.aleo": sources["a.aleo"], "b.aleo": sources["b.aleo"] });
  });
});

import { defineConfig } from "oxlint"

export default defineConfig({
  plugins: ["typescript", "unicorn"],
  categories: {
    correctness: "off"
  },
  env: {
    builtin: true
  },
  ignorePatterns: ["dist/", "node_modules/", ".commandcode/"],
  rules: {
    "no-array-constructor": "error",
    "no-unused-expressions": "error",
    "no-unused-vars": [
      "warn",
      {
        args: "after-used",
        argsIgnorePattern: "^_",
        caughtErrors: "none",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
        vars: "all",
        varsIgnorePattern: "^_"
      }
    ],
    "object-shorthand": ["error", "always"],
    "default-param-last": "error",
    "typescript/ban-ts-comment": "error",
    "typescript/no-duplicate-enum-values": "error",
    "typescript/no-empty-object-type": "error",
    "typescript/no-extra-non-null-assertion": "error",
    "typescript/no-misused-new": "error",
    "typescript/no-non-null-asserted-optional-chain": "error",
    "typescript/no-require-imports": "error",
    "typescript/no-this-alias": "error",
    "typescript/no-unnecessary-type-constraint": "error",
    "typescript/no-unsafe-declaration-merging": "error",
    "typescript/no-unsafe-function-type": "error",
    "typescript/no-wrapper-object-types": "error",
    "typescript/prefer-as-const": "error",
    "typescript/prefer-namespace-keyword": "error",
    "typescript/triple-slash-reference": "error",
    "typescript/adjacent-overload-signatures": "error",
    "typescript/array-type": "error",
    "typescript/ban-tslint-comment": "error",
    "typescript/class-literal-property-style": "error",
    "typescript/consistent-generic-constructors": ["error", "constructor"],
    "typescript/consistent-indexed-object-style": ["error", "record"],
    "typescript/consistent-type-assertions": [
      "error",
      {
        assertionStyle: "as",
        objectLiteralTypeAssertions: "allow"
      }
    ],
    "typescript/consistent-type-definitions": ["error", "interface"],
    "typescript/no-confusing-non-null-assertion": "error",
    "typescript/no-inferrable-types": "error",
    "typescript/prefer-for-of": "error",
    "typescript/prefer-function-type": "error",
    "typescript/explicit-member-accessibility": "error",
    "typescript/no-import-type-side-effects": "error"
    // TODO(tsgo): enable when Nest 12 supports TypeScript 7 / oxlint-tsgolint
    // Deferred type-aware rules from eslint.config.js (13 + 1 nursery):
    // - typescript/consistent-type-exports
    // - typescript/no-floating-promises
    // - typescript/no-array-delete
    // - typescript/no-base-to-string
    // - typescript/no-confusing-void-expression
    // - typescript/no-duplicate-type-constituents
    // - typescript/no-implied-eval
    // - typescript/no-misused-spread
    // - typescript/no-mixed-enums
    // - typescript/no-unsafe-enum-comparison
    // - typescript/no-unnecessary-qualifier
    // - typescript/no-unnecessary-type-assertion
    // - typescript/no-unnecessary-type-conversion
    // - typescript/no-unnecessary-condition (nursery)
  },
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      rules: {
        "constructor-super": "off",
        "getter-return": "off",
        "no-class-assign": "off",
        "no-const-assign": "off",
        "no-dupe-class-members": "off",
        "no-dupe-keys": "off",
        "no-func-assign": "off",
        "no-import-assign": "off",
        "no-new-native-nonconstructor": "off",
        "no-obj-calls": "off",
        "no-redeclare": "off",
        "no-setter-return": "off",
        "no-this-before-super": "off",
        "no-unreachable": "off",
        "no-unsafe-negation": "off",
        "no-var": "error",
        "no-with": "off",
        "prefer-const": "error",
        "prefer-rest-params": "error",
        "prefer-spread": "error"
      }
    }
  ]
})

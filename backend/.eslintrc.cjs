module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["./tsconfig.json"]
  },
  env: {
    node: true,
    es2022: true
  },
  plugins: ["@typescript-eslint", "security"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:security/recommended", "prettier"],
  rules: {
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        "checksVoidReturn": {
          "attributes": false
        }
      }
    ],
    "security/detect-object-injection": "off"
  }
};


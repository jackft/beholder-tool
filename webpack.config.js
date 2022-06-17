const path = require('path');
const TerserPlugin = require("terser-webpack-plugin");
const { CheckerPlugin } = require('awesome-typescript-loader')



module.exports = {
  entry: {
    'psych-coder': './src/index.ts',
    'psych-coder.min': './src/index.ts'
  },
  mode: "development",
  output: {
    path: path.resolve(__dirname, 'bundles'),
    filename: '[name].js',
    libraryTarget: 'umd',
    library: 'psychCoder',
    umdNamedDefine: true
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js']
  },
  devtool: 'source-map',
  optimization: {
    minimize: false,
    minimizer: [new TerserPlugin()]
  },
  plugins: [
      new CheckerPlugin()
  ],
  externals: [{
      "formiojs/Formio": {
        commonjs: "formiojs/Formio"
      },
      "jquery/jQuery": {
        commonjs: "jquery/jQuery"
      }
    }
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'awesome-typescript-loader'
      }
    ]
  }
}

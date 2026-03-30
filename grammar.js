/**
 * @file Zig grammar for tree-sitter
 * @author Amaan Qureshi <amaanq12@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  PAREN_DECLARATOR: -10,
  CONDITIONAL: -1,
  DEFAULT: 0,
  LOGICAL_OR: 1,
  LOGICAL_AND: 2,
  EQUAL: 3,
  BITWISE: 4,
  SHIFT: 5,
  ADD: 6,
  MULTIPLY: 7,
  UNARY: 8,
  STRUCT: 9,
  MEMBER: 10,
};

const builtinTypes = [
  'bool',
  'f16',
  'f32',
  'f64',
  'f80',
  'f128',
  'void',
  'type',
  'anyerror',
  'anyopaque',
  'type',
  'noreturn',
  'isize',
  'usize',
  'comptime_int',
  'comptime_float',
  'c_char',
  'c_short',
  'c_ushort',
  'c_int',
  'c_uint',
  'c_long',
  'c_ulong',
  'c_longlong',
  'c_ulonglong',
  'c_longdouble',
  /(i|u)[0-9]+/,
];

export default grammar({
  name: 'zig',

  externals: ($) => [$.doc_comment_content, $._error_sentinel],

  conflicts: $ => [
    [$._container_members],
    [$._loop_expression],
    [$._loop_type_expression],
  ],

  extras: $ => [
    $.comment,
    /\s/,
  ],

  inline: $ => [
    $.primitive_value,
  ],

  supertypes: $ => [
    $.statement,
    $.expression,
    $.primary_expression,
    $.type_expression,
    $.primary_type_expression,
  ],

  word: $ => $._identifier,

  rules: {
    source_file: $ => optional($._container_members),

    _container_members: $ => seq(
      repeat($.container_doc_comment),
      repeat($._container_declaration),
      repeat(seq($.container_field, ',')),
      choice(
        $.container_field,
        repeat1($._container_declaration),
      ),
    ),

    _container_declaration: $ => choice(
      $.test_declaration,
      $.comptime_declaration,
      seq(
        repeat($.doc_comment),
        optional('pub'),
        choice(
          $.variable_declaration, // ... GlobalVarDecl
          $.function_declaration,
          $.using_namespace_declaration, // Removed from Zig 0.15.x onward
        ),
      ),
    ),

    test_declaration: $ => seq(
      'test',
      optional(choice($.string, $.identifier)),
      $.block,
    ),

    comptime_declaration: $ => seq(
      'comptime',
      $.block,
    ),

    container_field: $ => prec.right(2, seq(
      repeat($.doc_comment),
      optional('comptime'),
      choice(seq(
        field('name', choice($.identifier, $.primitive_value, alias($.builtin_type, $.identifier))),
        ':',
        field('type', $._type_expression),
      ),
      field('name', $._type_expression),
      ),
      optional($.byte_alignment),
      optional(seq('=', $._expression)),
    )),

    variable_declaration: $ => seq(
      optional(choice(
        'export',
        seq('extern', optional($.string)),
      )),
      optional('threadlocal'),
      $._variable_declaration_header, // VarDeclProto
      optional(seq('=', $._expression)),
      ';',
    ),

    _variable_declaration_expression_statement: $ => choice(
      alias($.variable_declaration_list, $.variable_declaration),
      alias($.variable_destructure_statement, $.variable_declaration),
      $._assignment_or_expression_statement,
    ),

    variable_declaration_list: $ => seq(
      $._variable_declaration_header,
      repeat(prec(1, seq(',', choice($._variable_declaration_header, $._expression)))),
      '=',
      $._expression,
      ';',
    ),

    variable_destructure_statement: $ => seq(
      $._expression,
      repeat1(prec(1, seq(',', choice($._variable_declaration_header, $._expression)))),
      '=',
      $._expression,
      ';',
    ),

    _variable_declaration_header: $ => prec(1, seq(
      choice('const', 'var'),
      $.identifier,
      optional(seq(
        ':',
        field('type', $._type_expression),
      )),
      optional($.byte_alignment),
      optional($.address_space),
      optional($.link_section),
    )),

    function_declaration: $ => seq(
      optional(choice(
        'export',
        seq('extern', optional($.string)),
        'inline',
        'noinline',
      )),
      $._function_prototype,
      choice(
        ';',
        field('body', $.block),
      ),
    ),

    _function_prototype: $ => prec.left(seq(
      'fn',
      optional(field('name', $.identifier)),
      $.parameters,
      optional($.byte_alignment),
      optional($.address_space),
      optional($.link_section),
      optional($.calling_convention),
      optional('!'),
      field('type', $._type_expression),
    )),

    parameters: $ => seq('(', optionalCommaSep($.parameter), ')'),

    parameter: $ => choice(
      seq(
        repeat($.doc_comment),
        optional(choice('noalias', 'comptime')),
        optional(seq(
          field('name', choice($.identifier, alias($.builtin_type, $.identifier))),
          ':',
        )),
        field('type', choice($._type_expression, 'anytype')),
      ),
      '...',
    ),

    using_namespace_declaration: $ => seq(
      'usingnamespace',
      $._expression,
      ';',
    ),

    block: $ => seq(
      '{',
      repeat($._statement),
      '}',
    ),

    struct_declaration: $ => seq(
      'struct',
      optional(seq('(', $._expression, ')')),
      '{',
      $._container_members,
      '}',
    ),

    opaque_declaration: $ => seq(
      'opaque',
      '{',
      $._container_members,
      '}',
    ),

    enum_declaration: $ => seq(
      'enum',
      optional(seq('(', $._expression, ')')),
      '{',
      $._container_members,
      '}',
    ),

    union_declaration: $ => seq(
      'union',
      optional(seq(
        '(',
        choice(
          seq('enum', optional(seq('(', $._expression, ')'))),
          $._expression,
        ),
        ')',
      )),
      '{',
      $._container_members,
      '}',
    ),

    error_set_declaration: $ => seq(
      'error',
      '{',
      optionalCommaSep($.identifier),
      '}',
    ),

    statement: $ => choice(
      $.comptime_statement,
      $.nosuspend_statement,
      $.suspend_statement,
      $.defer_statement,
      $.errdefer_statement,
      $.if_statement,
    ),

    _statement: $ => choice(
      $.statement,
      $._labeled_statement,
      $._variable_declaration_expression_statement,
    ),

    comptime_statement: $ => seq(
      'comptime',
      choice(
        $._block_expression,
        $._variable_declaration_expression_statement,
      ),
    ),

    nosuspend_statement: $ => seq('nosuspend', $._block_expr_statement),

    suspend_statement: $ => seq('suspend', $._block_expr_statement),

    defer_statement: $ => seq('defer', $._block_expr_statement),

    errdefer_statement: $ => seq('errdefer', optional($.payload), $._block_expr_statement),

    _block_expr_statement: $ => prec(1, choice(
      $._block_expression,
      $._assignment_or_expression_statement,
    )),

    _block_expression: $ => prec(1, seq(optional($.block_label), $.block)),

    _labeled_statement: $ => prec(1, seq(
      optional($.block_label),
      choice($.block, $._loop_statement, $.switch_expression),
    )),

    _assignment_or_expression_statement: $ => seq($._general_expression, ';'),

    if_statement: $ => seq(
      $._if_prefix,
      $._conditional_body,
    ),

    _if_prefix: $ => seq(
      'if',
      '(',
      field('condition', $._expression),
      ')',
      optional($.payload),
    ),

    else_clause: $ => seq(
      'else',
      field('alternative', $._statement),
    ),

    _else_clause_payload: $ => seq(
      'else',
      optional($.payload),
      field('alternative', $._statement),
    ),

    _loop_statement: $ => seq(
      optional('inline'),
      choice($.for_statement, $.while_statement),
    ),

    for_statement: $ => seq(
      $._for_prefix,
      $._conditional_body,
    ),

    _for_prefix: $ => seq(
      'for',
      '(',
      optionalCommaSep(seq(
        $._expression,
        optional(seq('..', $._expression)),
      )),
      ')',
      $.payload,
    ),

    while_statement: $ => seq(
      $._while_prefix,
      $._conditional_body_else_payload,
    ),

    _while_prefix: $ => seq(
      'while',
      '(',
      field('condition', $._expression),
      ')',
      optional($.payload),
      optional(seq(':', '(', $._expression, ')')),
    ),

    _conditional_body: $ => choice(
      seq(
        field('body', $._block_expression),
        optional($.else_clause),
      ),
      seq(
        field('body', $._general_expression),
        choice(';', $.else_clause),
      ),
    ),

    _conditional_body_else_payload: $ => choice(
      seq(
        field('body', $._block_expression),
        optional($.else_clause),
      ),
      seq(
        field('body', $._general_expression),
        choice(';', alias($._else_clause_payload, $.else_clause)),
      ),
    ),

    payload: $ => seq('|', optionalCommaSep1(seq(optional('*'), $.identifier)), '|'),

    byte_alignment: $ => seq('align', '(', $._expression, ')'),

    address_space: $ => seq('addrspace', '(', $._expression, ')'),

    link_section: $ => seq('linksection', '(', $._expression, ')'),

    calling_convention: $ => seq('callconv', '(', $._expression, ')'),

    expression: $ => choice(
      $.unary_expression,
      $.binary_expression,
      $.try_expression, // special case of unary_expression
      $.catch_expression, // special case of binary expression
    ),

    _expression: $ => prec.right(choice(
      $.expression,
      $._primary_expression,
    )),

    primary_expression: $ => choice(
      $.asm_expression,
      $.if_expression,
      $.break_expression,
      $.comptime_expression,
      $.nosuspend_expression,
      $.continue_expression,
      $.async_expression, // Removed from Zig 0.15.x onward
      $.await_expression, // Removed from Zig 0.15.x onward
      $.resume_expression,
      $.return_expression,
      $.braced_expression, // CurlySuffixExpr
      $.block,
    ),

    _primary_expression: $ => choice(
      $.primary_expression,
      $._loop_expression,
      $._type_expression, // CurlySuffixExpr
    ),

    _loop_expression: $ => seq(
      optional($.block_label),
      optional('inline'),
      choice(
        $.for_expression,
        $.while_expression,
      ),
    ),

    braced_expression: $ => seq(
      $._type_expression,
      $.initializer_list,
    ),

    asm_expression: $ => seq(
      'asm',
      optional('volatile'),
      '(',
      $._expression,
      optional($.asm_output),
      ')',
    ),
    asm_output: $ => seq(':', optionalCommaSep($.asm_output_item), optional($.asm_input)),
    asm_output_item: $ => seq(
      '[',
      $.identifier,
      ']',
      choice($.string, $.multiline_string),
      '(',
      choice(seq('->', $._type_expression), $.identifier),
      ')',
    ),
    asm_input: $ => seq(':', optionalCommaSep($.asm_input_item), optional($.asm_clobbers)),
    asm_input_item: $ => seq(
      '[',
      $.identifier,
      ']',
      choice($.string, $.multiline_string),
      '(',
      $._expression,
      ')',
    ),
    asm_clobbers: $ => seq(':', optionalCommaSep(choice($.string, $.multiline_string))),

    if_expression: $ => prec.right(1, seq(
      $._if_prefix,
      $._expression,
      optional(seq('else', optional($.payload), $._expression)),
    )),

    for_expression: $ => prec.right(1, seq(
      $._for_prefix,
      $._expression,
      optional(seq('else', $._expression)),
    )),

    while_expression: $ => prec.right(1, seq(
      $._while_prefix,
      $._expression,
      optional(seq('else', optional($.payload), $._expression)),
    )),

    _general_expression: $ => prec.right(choice(
      $._expression,
      alias($._simple_assignment_expression, $.assignment_expression),
      alias($._destructure_assignment_expression, $.assignment_expression),
    )),

    _simple_assignment_expression: $ => seq(
      field('left', $._expression),
      field('operator', choice(
        '=', '*=', '*%=', '*|=', '/=', '%=',
        '+=', '+%=', '+|=', '-=', '-%=', '-|=',
        '<<=', '<<|=', '>>=', '&=', '^=', '|=',
      )),
      field('right', $._expression),
    ),

    _destructure_assignment_expression: $ => prec.right(seq(
      field('left', $._expression_list), // XXX: check to see if this worked right
      field('operator', '='),
      field('right', $._expression),
    )),

    _expression_list: $ => seq($._expression, repeat1(seq(',', $._expression))),

    unary_expression: $ => prec.left(PREC.UNARY, seq(
      field('operator', choice('!', '~', '-', '-%', '&')),
      field('argument', $._expression),
    )),

    binary_expression: $ => {
      const table = [
        ['or', PREC.LOGICAL_OR],
        ['and', PREC.LOGICAL_AND],
        ['==', PREC.EQUAL],
        ['!=', PREC.EQUAL],
        ['>', PREC.EQUAL],
        ['>=', PREC.EQUAL],
        ['<=', PREC.EQUAL],
        ['<', PREC.EQUAL],
        ['&', PREC.BITWISE],
        ['^', PREC.BITWISE],
        ['|', PREC.BITWISE],
        ['orelse', PREC.BITWISE],
        ['<<', PREC.SHIFT],
        ['>>', PREC.SHIFT],
        ['<<|', PREC.SHIFT],
        ['+', PREC.ADD],
        ['-', PREC.ADD],
        ['++', PREC.ADD],
        ['+%', PREC.ADD],
        ['-%', PREC.ADD],
        ['+|', PREC.ADD],
        ['-|', PREC.ADD],
        ['*', PREC.MULTIPLY],
        ['/', PREC.MULTIPLY],
        ['%', PREC.MULTIPLY],
        ['**', PREC.MULTIPLY],
        ['*%', PREC.MULTIPLY],
        ['*|', PREC.MULTIPLY],
        ['||', PREC.MULTIPLY],
      ];

      return choice(...table.map(([operator, precedence]) => {
        return prec.left(precedence, seq(
          field('left', $._expression),
          // @ts-ignore:
          field('operator', operator),
          field('right', $._expression),
        ));
      }));
    },

    comptime_expression: $ => prec.right(1, seq('comptime', $._expression)),

    async_expression: $ => prec.right(1, seq('async', $._expression)),

    await_expression: $ => prec.right(1, seq('await', $._expression)),

    nosuspend_expression: $ => prec.right(1, seq('nosuspend', $._expression)),

    continue_expression: $ => prec.right(1, seq(
      'continue',
      optional($.break_label),
      optional($._expression),
    )),

    resume_expression: $ => prec.right(1, seq('resume', $._expression)),

    return_expression: $ => prec.right(1, seq('return', optional($._expression))),

    break_expression: $ => prec.right(1, seq(
      'break',
      optional($.break_label),
      optional($._expression),
    )),

    try_expression: $ => prec.left(PREC.UNARY, seq('try', $._expression)),

    catch_expression: $ => prec.right(PREC.BITWISE, seq(
      $._expression,
      'catch',
      optional($.payload),
      $._expression,
    )),

    switch_expression: $ => seq(
      'switch',
      '(', $._expression, ')',
      '{',
      optionalCommaSep($.switch_case), // SwtichProngList
      '}',
    ),

    // SwitchProng
    switch_case: $ => seq(
      optional('inline'),
      $._switch_case_exp, // SwitchCase
      '=>',
      optional($.payload),
      // SingleAssignExpr
      choice(
        $._expression,
        alias($._simple_assignment_expression, $.assignment_expression),
      ),
    ),

    // SwitchCase
    _switch_case_exp: $ => seq(
      choice(
        optionalCommaSep1(seq($._expression, optional(seq('...', $._expression)))),
        'else',
      ),
    ),

    type_expression: $ => prec.right(choice(
      // Have PrefixTypeOp
      $.nullable_type, // PrefixTypeOp = `?`
      $.anyframe_type, // PrefixTypeOp = `anyframe ->`
      $.slice_type,
      $.pointer_type,
      $.array_type,
      // Do not have PrefixTypeOp
      $.error_union_type,
      $.suffix_expression,
    )),

    _type_expression: $ => prec.right(choice(
      $.type_expression,
      $._primary_type_expression,
    )),

    suffix_expression: $ => prec.right(PREC.MEMBER, seq(
      field('head', $._primary_type_expression),
      repeat1(choice(
        field('arguments', $.arguments),
        alias($._index_suffix, $.index_expression),
        alias($._range_suffix, $.range_expression),
        alias($._field_suffix, $.field_expression),
        '.*',
        '.?',
      )),
    )),

    primary_type_expression: $ => choice(
      $.builtin_function,
      $.character,
      $.container_type_declaration, // ContainerDecl, not to be confused with ContainerDeclaration...
      $.anonymous_struct_initializer, // DOT InitList
      $.error_set_declaration,
      $.parenthesized_expression, // GroupedExpr
      $.if_type_expression,
      $.comptime_type_expression, // KEYWORD_comptime TypeExpr
      prec.right(alias($._function_prototype, $.function_signature)),
      alias($._field_suffix, $.field_expression), // DOT IDENTIFIER
      $.identifier,
      $.primitive_value, // Technically should be IDENTIFIER, but this way they can be highlighted separately
      $.float,
      $.integer,
      $.error_type, // KEYWORD_error DOT IDENTIFIER
      'anyframe',
      'unreachable',
      $.string,
      $.multiline_string,
      $.builtin_type,
    ),

    _primary_type_expression: $ => choice(
      $.primary_type_expression,
      $._labeled_type_expression,
    ),

    container_type_declaration: $ => seq(
      optional(choice('extern', 'packed')),
      choice(
        $.struct_declaration,
        $.opaque_declaration,
        $.enum_declaration,
        $.union_declaration,
      ),
    ),

    nullable_type: $ => prec(1, seq(
      '?',
      choice(
        $.error_union_type,
        $.suffix_expression,
        $._primary_type_expression,
      ),
    )),

    anyframe_type: $ => prec(1, seq(
      'anyframe',
      '->',
      choice(
        $.error_union_type,
        $.suffix_expression,
        $._primary_type_expression,
      ),
    )),

    slice_type: $ => prec.right(1, seq(
      '[',
      optional(seq(
        ':',
        field('sentinel', $._expression),
      )),
      ']',
      repeat(choice(
        $.byte_alignment,
        $.address_space,
        'const',
        'volatile',
        'allowzero',
      )),
      choice(
        $.error_union_type,
        $.suffix_expression,
        $._primary_type_expression,
      ),
    )),

    pointer_type: $ => prec.right(1, seq(
      choice(
        '*',
        '**',
        seq(
          '[',
          '*',
          optional(choice('c', seq(':', $._expression))),
          ']',
        ),
      ),
      repeat(choice(
        $.address_space,
        seq(
          'align',
          '(',
          $._expression,
          optional(seq(':', $._expression, ':', $._expression)),
          ')',
        ),
        'const',
        'volatile',
        'allowzero',
      )),
      choice(
        $.error_union_type,
        $.suffix_expression,
        $._primary_type_expression,
      ),
    )),

    array_type: $ => prec(1, seq(
      '[',
      $._expression,
      optional(seq(':', $._expression)),
      ']',
      choice(
        $.error_union_type,
        $.suffix_expression,
        $._primary_type_expression,
      ),
    )),

    error_union_type: $ => prec.right(seq(
      field('error', choice($.suffix_expression, $._primary_type_expression)),
      '!',
      field('ok', $._type_expression),
    )),

    _field_suffix: $ => seq(
      '.',
      field('member', $.identifier),
    ),

    _index_suffix: $ => seq(
      '[',
      field('index', $._expression),
      optional(seq(':', field('sentinel', $._expression))),
      ']',
    ),

    _range_suffix: $ => seq(
      '[',
      field('left', $._expression),
      '..',
      optional(field('right', $._expression)),
      ']',
    ),


    anonymous_struct_initializer: $ => seq('.', $.initializer_list),

    initializer_list: $ => seq(
      '{',
      choice(
        optionalCommaSep($.field_initializer),
        optionalCommaSep($._expression),
      ),
      '}',
    ),

    field_initializer: $ => seq(
      '.',
      $.identifier,
      '=',
      $._expression,
    ),

    _labeled_type_expression: $ => choice(
      seq($.block_label, $.block),
      seq(optional($.block_label), $._loop_type_expression),
      seq(optional($.block_label), $.switch_expression),
    ),

    comptime_type_expression: $ => prec.right(1, seq('comptime', $._type_expression)),

    if_type_expression: $ => prec.right(1, seq(
      $._if_prefix,
      $._type_expression,
      optional(seq('else', optional($.payload), $._type_expression)),
    )),

    for_type_expression: $ => prec.right(1, seq(
      $._for_prefix,
      $._type_expression,
      optional(seq('else', $._type_expression)),
    )),

    while_type_expression: $ => prec.right(1, seq(
      $._while_prefix,
      $._type_expression,
      optional(seq('else', optional($.payload), $._type_expression)),
    )),

    _loop_type_expression: $ => seq(
      optional('inline'),
      choice(
        $.for_type_expression,
        $.while_type_expression,
      ),
    ),

    parenthesized_expression: $ => seq('(', $._expression, ')'),

    block_label: $ => prec(-1, seq(
      choice($.identifier, alias($.builtin_type, $.identifier)),
      ':',
    )),
    break_label: $ => seq(':', $.identifier),

    arguments: $ => seq('(', optionalCommaSep($._expression), ')'),

    builtin_function: $ => seq(
      $.builtin_identifier,
      $.arguments,
    ),

    string: $ => seq(
      '"',
      repeat(choice(
        alias(token.immediate(prec(1, /[^\\"\n]+/)), $.string_content),
        $.escape_sequence,
      )),
      '"',
    ),

    multiline_string: _ => prec.right(repeat1(seq('\\\\', /[^\n]*/))),

    escape_sequence: _ => token(prec(1, seq(
      '\\',
      choice(
        /[^xuU]/,
        /\d{2,3}/,
        /x[0-9a-fA-F]{2,}/,
        /u\{[0-9a-fA-F]{1,6}\}/,
      ),
    ))),

    character: $ => seq(
      '\'',
      choice(
        alias(/[^'\n]/, $.character_content),
        $.escape_sequence,
      ),
      '\'',
    ),

    integer: _ => {
      const separator = '_';
      const hex = /[0-9A-Fa-f]/;
      const oct = /[0-7]/;
      const bin = /[0-1]/;
      const decimal = /[0-9]/;
      const hexDigits = seq(repeat1(hex), repeat(seq(separator, repeat1(hex))));
      const octDigits = seq(repeat1(oct), repeat(seq(separator, repeat1(oct))));
      const binDigits = seq(repeat1(bin), repeat(seq(separator, repeat1(bin))));
      const decimalDigits = seq(repeat1(decimal), repeat(seq(separator, repeat1(decimal))));

      return token(choice(
        seq('0x', hexDigits),
        seq('0o', octDigits),
        seq('0b', binDigits),
        decimalDigits,
      ));
    },

    float: _ => {
      const separator = '_';
      const hex = /[0-9A-Fa-f]/;
      const decimal = /[0-9]/;
      const hexDigits = seq(repeat1(hex), repeat(seq(separator, repeat1(hex))));
      const decimalDigits = seq(repeat1(decimal), repeat(seq(separator, repeat1(decimal))));

      return token(choice(
        seq('0x', hexDigits, '.', hexDigits, optional(seq(/[pP][+-]?/, decimalDigits))),
        seq(decimalDigits, '.', decimalDigits, optional(seq(/[eE][+-]?/, decimalDigits))),
        seq('0x', hexDigits, /[pP][+-]?/, decimalDigits),
        seq(decimalDigits, /[eE][+-]?/, decimalDigits),
      ));
    },

    boolean: _ => choice('true', 'false'),

    builtin_type: _ => choice(...builtinTypes),

    error_type: $ => seq('error', '.', $.identifier),

    builtin_identifier: _ => /@[A-Za-z_][A-Za-z0-9_]*/,

    identifier: $ => choice($._identifier, seq('@', alias($.string, $._string))),
    _identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,
    primitive_value: $ => choice(
      'undefined',
      'null',
      $.boolean,
    ),

    container_doc_comment: $ => prec(3, seq('//!', $.doc_comment_content)),

    doc_comment: $ => prec(2, seq('///', $.doc_comment_content)),

    comment: _ => choice(
      prec(1, seq('//', /.*/)),
      // `//// ...` looks like a `doc_comment`, but it is not
      prec(4, seq('////', /.*/)),
    ),
  },
});

/**
 * Creates a rule to optionally match one or more of the rules
 * separated by a comma and optionally ending with a comma
 *
 * @param {RuleOrLiteral} rule
 *
 * @returns {ChoiceRule}
 */
function optionalCommaSep(rule) {
  return optional(optionalCommaSep1(rule));
}

/**
 * Creates a rule to match one or more of the rules separated by a comma
 * and optionally ending with a comma
 *
 * @param {RuleOrLiteral} rule
 *
 * @returns {SeqRule}
 */
function optionalCommaSep1(rule) {
  return seq(commaSep1(rule), optional(','));
}

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {RuleOrLiteral} rule
 *
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

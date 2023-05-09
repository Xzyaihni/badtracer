#!/bin/sh

fragment_path="main.frag"
output_path="main.js"

echo "copying shaders to main.js"

vertex_shader=`cat main.vert`
echo "const v_shader = \`$vertex_shader\`;" > $output_path

fragment_shader=`cat $fragment_path`
echo "const f_shader = \`$fragment_shader\`;" >> $output_path

echo "copying f_shader constants"
grep 'COPY TO JS' $fragment_path | sed 's/int //' >> $output_path

echo "copying premain.js to $output_path"

cat premain.js >> $output_path

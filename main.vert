#version 300 es

in vec4 a_vertex_position;

void main()
{
    gl_Position = a_vertex_position;
}